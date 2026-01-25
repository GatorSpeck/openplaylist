"""
API routes for managing scheduled background tasks.
"""
import logging
from typing import Dict, List, Optional
from urllib.parse import unquote
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from croniter import croniter
from datetime import datetime
from tzlocal import get_localzone

from task_scheduler import task_scheduler
from dependencies import get_playlist_repository
from repositories.playlist_repository import PlaylistRepository

# Get the server's local timezone
LOCAL_TIMEZONE = get_localzone()


logger = logging.getLogger(__name__)

# Create router for scheduled tasks
scheduled_tasks_router = APIRouter(prefix="/api/scheduled-tasks", tags=["scheduled-tasks"])


# Pydantic models for API
class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Task name")
    task_type: str = Field(..., pattern="^(library_scan|playlist_sync)$", description="Task type")
    cron_expression: str = Field(..., description="Cron expression (5 parts: min hour day month dow)")
    config: Optional[Dict] = Field(default_factory=dict, description="Task-specific configuration")
    enabled: bool = Field(default=True, description="Whether the task is enabled")


class TaskUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200, description="Task name")
    cron_expression: Optional[str] = Field(None, description="Cron expression")
    enabled: Optional[bool] = Field(None, description="Whether the task is enabled")
    config: Optional[Dict] = Field(None, description="Task-specific configuration")


class TaskResponse(BaseModel):
    id: int
    name: str
    task_type: str
    cron_expression: str
    enabled: bool
    config: Dict
    created_at: Optional[str]
    updated_at: Optional[str]
    last_run_at: Optional[str]
    next_run_at: Optional[str]
    total_runs: int
    successful_runs: int
    failed_runs: int
    last_run_status: Optional[str]
    last_error_message: Optional[str]


class PlaylistSyncSettings(BaseModel):
    auto_sync_enabled: bool
    auto_sync_schedule: Optional[str] = Field(None, description="Cron expression for auto sync")


# API endpoints
@scheduled_tasks_router.get("/", response_model=List[TaskResponse])
def get_scheduled_tasks():
    """Get all scheduled tasks"""
    try:
        tasks = task_scheduler.get_tasks()
        return tasks
    except Exception as e:
        logger.error(f"Failed to get scheduled tasks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@scheduled_tasks_router.get("/{task_id}", response_model=TaskResponse)
def get_scheduled_task(task_id: int):
    """Get a specific scheduled task"""
    try:
        task = task_scheduler.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        return task
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@scheduled_tasks_router.post("/", response_model=Dict[str, int])
def create_scheduled_task(task: TaskCreate):
    """Create a new scheduled task"""
    try:
        # Validate cron expression
        if not croniter.is_valid(task.cron_expression):
            raise HTTPException(status_code=400, detail=f"Invalid cron expression: {task.cron_expression}")
        
        # Validate task type specific config
        if task.task_type == "playlist_sync" and task.config:
            playlist_ids = task.config.get('playlist_ids', [])
            if playlist_ids and not all(isinstance(pid, int) for pid in playlist_ids):
                raise HTTPException(status_code=400, detail="playlist_ids must be a list of integers")
        
        # Create the task
        task_id = task_scheduler.add_task(
            name=task.name,
            task_type=task.task_type,
            cron_expression=task.cron_expression,
            config=task.config
        )
        
        # Enable/disable as requested
        if not task.enabled:
            task_scheduler.update_task(task_id, enabled=False)
        
        return {"task_id": task_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@scheduled_tasks_router.put("/{task_id}", response_model=Dict[str, str])
def update_scheduled_task(task_id: int, task: TaskUpdate):
    """Update an existing scheduled task"""
    try:
        # Validate cron expression if provided
        if task.cron_expression and not croniter.is_valid(task.cron_expression):
            raise HTTPException(status_code=400, detail=f"Invalid cron expression: {task.cron_expression}")
        
        # Update the task
        task_scheduler.update_task(
            task_id=task_id,
            name=task.name,
            cron_expression=task.cron_expression,
            enabled=task.enabled,
            config=task.config
        )
        
        return {"message": "Task updated successfully"}
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@scheduled_tasks_router.delete("/{task_id}", response_model=Dict[str, str])
def delete_scheduled_task(task_id: int):
    """Delete a scheduled task"""
    try:
        task_scheduler.remove_task(task_id)
        return {"message": "Task deleted successfully"}
        
    except Exception as e:
        logger.error(f"Failed to delete task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@scheduled_tasks_router.post("/validate-cron")
def validate_cron_expression_post(data: dict):
    """Validate a cron expression via POST (to avoid URL encoding issues)"""
    try:
        cron_expression = data.get("cron_expression", "")
        logger.info(f"POST Validating cron expression: '{cron_expression}'")
        
        if not cron_expression:
            return {"valid": False, "error": "Cron expression is required"}
        
        # Validate the cron expression
        if not croniter.is_valid(cron_expression):
            error_msg = f"Invalid cron expression format: '{cron_expression}'"
            logger.warning(error_msg)
            return {"valid": False, "error": error_msg}
        
        # Get next 5 run times to show user
        cron = croniter(cron_expression, datetime.now(LOCAL_TIMEZONE))
        next_runs = []
        for _ in range(5):
            next_run = cron.get_next(datetime)
            # Convert to ISO format but keep timezone info for display
            next_runs.append(next_run.isoformat())
        
        logger.info(f"Cron expression '{cron_expression}' is valid")
        return {
            "valid": True,
            "next_runs": next_runs,
            "timezone": str(LOCAL_TIMEZONE)
        }
        
    except Exception as e:
        error_msg = f"POST Validation error: {str(e)}"
        logger.error(error_msg)
        return {"valid": False, "error": error_msg}


@scheduled_tasks_router.get("/validate-cron/{cron_expression}")
def validate_cron_expression(cron_expression: str):
    """Validate a cron expression and return next few run times"""
    try:
        # Log the raw expression received
        logger.info(f"Validating cron expression (raw): {cron_expression}")
        
        # Decode URL-encoded cron expression
        decoded_expression = unquote(cron_expression)
        logger.info(f"Validating cron expression (decoded): '{decoded_expression}'")
        
        # Validate the cron expression
        if not croniter.is_valid(decoded_expression):
            error_msg = f"Invalid cron expression format: '{decoded_expression}'"
            logger.warning(error_msg)
            return {"valid": False, "error": error_msg}
        
        # Get next 5 run times to show user
        cron = croniter(decoded_expression, datetime.now(LOCAL_TIMEZONE))
        next_runs = []
        for _ in range(5):
            next_run = cron.get_next(datetime)
            next_runs.append(next_run.isoformat())
        
        logger.info(f"Cron expression '{decoded_expression}' is valid")
        return {
            "valid": True,
            "next_runs": next_runs,
            "timezone": str(LOCAL_TIMEZONE)
        }
        
    except Exception as e:
        error_msg = f"Validation error for '{cron_expression}': {str(e)}"
        logger.error(error_msg)
        return {"valid": False, "error": error_msg}


# Playlist auto-sync settings routes
playlist_sync_router = APIRouter(prefix="/api/playlists", tags=["playlist-sync"])


@playlist_sync_router.get("/{playlist_id}/auto-sync", response_model=PlaylistSyncSettings)
def get_playlist_auto_sync_settings(playlist_id: int, repo: PlaylistRepository = Depends(get_playlist_repository)):
    """Get auto-sync settings for a playlist"""
    try:
        playlist = repo.get_by_id(playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail=f"Playlist {playlist_id} not found")
        
        # Get the database record to access the new fields
        from database import Database
        from models import PlaylistDB
        db = Database.get_session()
        try:
            playlist_db = db.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
            if not playlist_db:
                raise HTTPException(status_code=404, detail=f"Playlist {playlist_id} not found")
            
            return PlaylistSyncSettings(
                auto_sync_enabled=playlist_db.auto_sync_enabled or False,
                auto_sync_schedule=playlist_db.auto_sync_schedule
            )
        finally:
            db.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get auto-sync settings for playlist {playlist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@playlist_sync_router.put("/{playlist_id}/auto-sync", response_model=Dict[str, str])
def update_playlist_auto_sync_settings(
    playlist_id: int, 
    settings: PlaylistSyncSettings, 
    repo: PlaylistRepository = Depends(get_playlist_repository)
):
    """Update auto-sync settings for a playlist"""
    try:
        # Validate cron expression if provided
        if settings.auto_sync_schedule and not croniter.is_valid(settings.auto_sync_schedule):
            raise HTTPException(status_code=400, detail=f"Invalid cron expression: {settings.auto_sync_schedule}")
        
        # Verify playlist exists
        playlist = repo.get_by_id(playlist_id)
        if not playlist:
            raise HTTPException(status_code=404, detail=f"Playlist {playlist_id} not found")
        
        # Update the database record directly
        from database import Database
        from models import PlaylistDB
        db = Database.get_session()
        try:
            playlist_db = db.query(PlaylistDB).filter(PlaylistDB.id == playlist_id).first()
            if not playlist_db:
                raise HTTPException(status_code=404, detail=f"Playlist {playlist_id} not found")
            
            playlist_db.auto_sync_enabled = settings.auto_sync_enabled
            playlist_db.auto_sync_schedule = settings.auto_sync_schedule
            db.commit()
            
            return {"message": "Auto-sync settings updated successfully"}
            
        except Exception as e:
            db.rollback()
            raise
        finally:
            db.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update auto-sync settings for playlist {playlist_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))