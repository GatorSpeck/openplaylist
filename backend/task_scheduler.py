"""
Task scheduler service for background tasks using APScheduler with cron syntax.
Handles library scanning and playlist syncing on schedules defined by users.
"""
import logging
import os
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from croniter import croniter
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.jobstores.memory import MemoryJobStore
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pytz
from tzlocal import get_localzone

from database import Database
from models import ScheduledTaskDB, PlaylistDB
from job_tracker import job_tracker, JobType


logger = logging.getLogger(__name__)

# Get the server's local timezone
LOCAL_TIMEZONE = get_localzone()


class TaskScheduler:
    """Manages scheduled background tasks using APScheduler"""
    
    def __init__(self):
        # Configure job stores and executors
        jobstores = {
            'default': MemoryJobStore()
        }
        executors = {
            'default': ThreadPoolExecutor(20),
        }
        job_defaults = {
            'coalesce': False,
            'max_instances': 1
        }
        
        self.scheduler = BackgroundScheduler(
            jobstores=jobstores,
            executors=executors,
            job_defaults=job_defaults,
            timezone=LOCAL_TIMEZONE  # Use local timezone instead of UTC
        )
        self._running = False
    
    def start(self):
        """Start the scheduler and load existing tasks"""
        if not self._running:
            self.scheduler.start()
            self._running = True
            self.load_scheduled_tasks()
            logger.info("Task scheduler started")
    
    def shutdown(self):
        """Shutdown the scheduler"""
        if self._running:
            self.scheduler.shutdown()
            self._running = False
            logger.info("Task scheduler stopped")
    
    def load_scheduled_tasks(self):
        """Load all enabled scheduled tasks from the database"""
        try:
            db = Database.get_session()
            tasks = db.query(ScheduledTaskDB).filter(ScheduledTaskDB.enabled == True).all()
            
            for task in tasks:
                try:
                    self._schedule_task(task)
                    logger.info(f"Loaded scheduled task: {task.name}")
                except Exception as e:
                    logger.error(f"Failed to load task {task.name}: {e}")
                    
        except Exception as e:
            logger.error(f"Failed to load scheduled tasks: {e}")
    
    def _schedule_task(self, task: ScheduledTaskDB):
        """Schedule a single task with APScheduler"""
        try:
            # Validate cron expression
            if not croniter.is_valid(task.cron_expression):
                raise ValueError(f"Invalid cron expression: {task.cron_expression}")
            
            # Parse cron expression for APScheduler
            cron_parts = task.cron_expression.strip().split()
            if len(cron_parts) != 5:
                raise ValueError(f"Cron expression must have 5 parts: {task.cron_expression}")
            
            minute, hour, day, month, day_of_week = cron_parts
            
            # Convert cron format to APScheduler format
            trigger = CronTrigger(
                minute=minute,
                hour=hour,
                day=day,
                month=month,
                day_of_week=day_of_week,
                timezone=LOCAL_TIMEZONE  # Use local timezone
            )
            
            # Determine the task function to execute
            if task.task_type == 'library_scan':
                func = self._execute_library_scan
            elif task.task_type == 'playlist_sync':
                func = self._execute_playlist_sync
            else:
                raise ValueError(f"Unknown task type: {task.task_type}")
            
            # Schedule the job
            self.scheduler.add_job(
                func=func,
                trigger=trigger,
                args=[task.id],
                id=f"scheduled_task_{task.id}",
                name=task.name,
                replace_existing=True
            )
            
            # Update next run time in database
            next_run = croniter(task.cron_expression, datetime.now(LOCAL_TIMEZONE)).get_next(datetime)
            self._update_task_next_run(task.id, next_run)
            
        except Exception as e:
            logger.error(f"Failed to schedule task {task.name}: {e}")
            raise
    
    def add_task(self, name: str, task_type: str, cron_expression: str, config: Optional[Dict] = None) -> int:
        """Add a new scheduled task"""
        db = Database.get_session()
        try:
            # Validate cron expression
            if not croniter.is_valid(cron_expression):
                raise ValueError(f"Invalid cron expression: {cron_expression}")
            
            # Calculate next run time
            next_run = croniter(cron_expression, datetime.now(LOCAL_TIMEZONE)).get_next(datetime)
            
            # Create task record
            task = ScheduledTaskDB(
                name=name,
                task_type=task_type,
                cron_expression=cron_expression,
                config=config or {},
                next_run_at=next_run,
                enabled=True
            )
            
            db.add(task)
            db.commit()
            db.refresh(task)
            
            # Schedule with APScheduler
            self._schedule_task(task)
            
            logger.info(f"Added scheduled task: {name} with cron: {cron_expression}")
            return task.id
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to add task {name}: {e}")
            raise
        finally:
            db.close()
    
    def remove_task(self, task_id: int):
        """Remove a scheduled task"""
        db = Database.get_session()
        try:
            task = db.query(ScheduledTaskDB).filter(ScheduledTaskDB.id == task_id).first()
            if task:
                # Remove from scheduler
                try:
                    self.scheduler.remove_job(f"scheduled_task_{task_id}")
                except Exception:
                    pass  # Job might not be scheduled
                
                # Remove from database
                db.delete(task)
                db.commit()
                logger.info(f"Removed scheduled task: {task.name}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to remove task {task_id}: {e}")
            raise
        finally:
            db.close()
    
    def update_task(self, task_id: int, name: Optional[str] = None, 
                   cron_expression: Optional[str] = None, 
                   enabled: Optional[bool] = None,
                   config: Optional[Dict] = None):
        """Update an existing scheduled task"""
        db = Database.get_session()
        try:
            task = db.query(ScheduledTaskDB).filter(ScheduledTaskDB.id == task_id).first()
            if not task:
                raise ValueError(f"Task {task_id} not found")
            
            # Update fields
            if name is not None:
                task.name = name
            if cron_expression is not None:
                if not croniter.is_valid(cron_expression):
                    raise ValueError(f"Invalid cron expression: {cron_expression}")
                task.cron_expression = cron_expression
                # Recalculate next run time
                next_run = croniter(cron_expression, datetime.now(LOCAL_TIMEZONE)).get_next(datetime)
                task.next_run_at = next_run
            if enabled is not None:
                task.enabled = enabled
            if config is not None:
                task.config = config
            
            task.updated_at = datetime.now(LOCAL_TIMEZONE)
            db.commit()
            
            # Reschedule with APScheduler
            try:
                self.scheduler.remove_job(f"scheduled_task_{task_id}")
            except Exception:
                pass  # Job might not exist
            
            if task.enabled:
                self._schedule_task(task)
            
            logger.info(f"Updated scheduled task: {task.name}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update task {task_id}: {e}")
            raise
        finally:
            db.close()
    
    def get_tasks(self) -> List[Dict]:
        """Get all scheduled tasks"""
        db = Database.get_session()
        try:
            tasks = db.query(ScheduledTaskDB).all()
            return [self._task_to_dict(task) for task in tasks]
        finally:
            db.close()
    
    def get_task(self, task_id: int) -> Optional[Dict]:
        """Get a specific scheduled task"""
        db = Database.get_session()
        try:
            task = db.query(ScheduledTaskDB).filter(ScheduledTaskDB.id == task_id).first()
            return self._task_to_dict(task) if task else None
        finally:
            db.close()
    
    def _task_to_dict(self, task: ScheduledTaskDB) -> Dict:
        """Convert task model to dictionary"""
        return {
            'id': task.id,
            'name': task.name,
            'task_type': task.task_type,
            'cron_expression': task.cron_expression,
            'enabled': task.enabled,
            'config': task.config,
            'created_at': task.created_at.isoformat() if task.created_at else None,
            'updated_at': task.updated_at.isoformat() if task.updated_at else None,
            'last_run_at': task.last_run_at.isoformat() if task.last_run_at else None,
            'next_run_at': task.next_run_at.isoformat() if task.next_run_at else None,
            'total_runs': task.total_runs,
            'successful_runs': task.successful_runs,
            'failed_runs': task.failed_runs,
            'last_run_status': task.last_run_status,
            'last_error_message': task.last_error_message
        }
    
    def _update_task_next_run(self, task_id: int, next_run: datetime):
        """Update the next run time for a task"""
        db = Database.get_session()
        try:
            task = db.query(ScheduledTaskDB).filter(ScheduledTaskDB.id == task_id).first()
            if task:
                task.next_run_at = next_run
                db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update next run time for task {task_id}: {e}")
        finally:
            db.close()
    
    def _update_task_execution_stats(self, task_id: int, success: bool, error_message: Optional[str] = None):
        """Update task execution statistics"""
        db = Database.get_session()
        try:
            task = db.query(ScheduledTaskDB).filter(ScheduledTaskDB.id == task_id).first()
            if task:
                task.last_run_at = datetime.now(LOCAL_TIMEZONE)
                task.total_runs += 1
                if success:
                    task.successful_runs += 1
                    task.last_run_status = 'success'
                    task.last_error_message = None
                else:
                    task.failed_runs += 1
                    task.last_run_status = 'failed'
                    task.last_error_message = error_message
                
                # Calculate next run time
                next_run = croniter(task.cron_expression, datetime.now(timezone.utc)).get_next(datetime)
                task.next_run_at = next_run
                
                db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update execution stats for task {task_id}: {e}")
        finally:
            db.close()
    
    def _execute_library_scan(self, task_id: int):
        """Execute a library scan task"""
        logger.info(f"Executing library scan task {task_id}")
        
        try:
            # Update task status
            self._update_task_running_status(task_id)
            
            # Create a job for tracking
            job_id = job_tracker.create_job(
                JobType.LIBRARY_SCAN,
                f"Scheduled Library Scan",
                f"Scheduled library scan task {task_id}"
            )
            
            # Import and execute the scan function
            from main import scan_directory
            
            # Get music paths from config
            config_file = os.path.join(os.getenv("CONFIG_DIR", "/config"), "config.json")
            music_paths = []
            if os.path.exists(config_file):
                try:
                    with open(config_file, 'r') as f:
                        config = json.load(f)
                        music_paths = config.get('music_paths', [])
                except Exception as e:
                    logger.error(f"Failed to load music paths from config: {e}")
            
            # Fallback to environment variable
            if not music_paths:
                music_paths = [os.getenv("MUSIC_PATH", "/music")]
            
            # Execute scan for each path
            for path in music_paths:
                if os.path.exists(path):
                    scan_directory(path, full=False, job_id=job_id)
            
            self._update_task_execution_stats(task_id, True)
            logger.info(f"Library scan task {task_id} completed successfully")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Library scan task {task_id} failed: {error_msg}")
            self._update_task_execution_stats(task_id, False, error_msg)
    
    def _execute_playlist_sync(self, task_id: int):
        """Execute playlist sync tasks"""
        logger.info(f"Executing playlist sync task {task_id}")
        
        try:
            # Update task status
            self._update_task_running_status(task_id)
            
            # Get task config to determine which playlists to sync
            db = Database.get_session()
            task = db.query(ScheduledTaskDB).filter(ScheduledTaskDB.id == task_id).first()
            if not task:
                raise ValueError(f"Task {task_id} not found")
            
            config = task.config or {}
            
            # If specific playlist IDs are configured, sync only those
            playlist_ids = config.get('playlist_ids', [])
            if playlist_ids:
                playlists = db.query(PlaylistDB).filter(PlaylistDB.id.in_(playlist_ids)).all()
            else:
                # Sync all playlists with auto_sync enabled
                playlists = db.query(PlaylistDB).filter(PlaylistDB.auto_sync_enabled == True).all()
            
            db.close()
            
            if not playlists:
                logger.info(f"No playlists to sync for task {task_id}")
                self._update_task_execution_stats(task_id, True)
                return
            
            # Create jobs for each playlist sync
            success_count = 0
            total_count = len(playlists)
            errors = []
            
            for playlist in playlists:
                try:
                    job_id = job_tracker.create_job(
                        JobType.PLAYLIST_SYNC,
                        f"Scheduled Sync - {playlist.name}",
                        f"Scheduled sync of playlist {playlist.id} from task {task_id}"
                    )
                    
                    # Import and execute sync
                    from main import sync_playlist_background
                    sync_playlist_background(playlist.id, False, job_id)
                    success_count += 1
                    
                except Exception as e:
                    error_msg = f"Failed to sync playlist {playlist.name}: {str(e)}"
                    logger.error(error_msg)
                    errors.append(error_msg)
            
            # Update task stats
            if success_count == total_count:
                self._update_task_execution_stats(task_id, True)
            else:
                error_summary = f"Synced {success_count}/{total_count} playlists. Errors: {'; '.join(errors)}"
                self._update_task_execution_stats(task_id, False, error_summary)
            
            logger.info(f"Playlist sync task {task_id} completed: {success_count}/{total_count} successful")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Playlist sync task {task_id} failed: {error_msg}")
            self._update_task_execution_stats(task_id, False, error_msg)
    
    def _update_task_running_status(self, task_id: int):
        """Update task status to running"""
        db = Database.get_session()
        try:
            task = db.query(ScheduledTaskDB).filter(ScheduledTaskDB.id == task_id).first()
            if task:
                task.last_run_status = 'running'
                task.updated_at = datetime.now(LOCAL_TIMEZONE)
                db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update running status for task {task_id}: {e}")
        finally:
            db.close()


# Global task scheduler instance
task_scheduler = TaskScheduler()