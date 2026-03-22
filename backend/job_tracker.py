from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Callable
from pydantic import BaseModel
import uuid
import threading
import time
from dataclasses import dataclass, field


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running" 
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    LIBRARY_SCAN = "library_scan"
    FULL_LIBRARY_SCAN = "full_library_scan"
    PLAYLIST_SYNC = "playlist_sync"
    CUSTOM = "custom"


@dataclass
class Job:
    id: str
    type: JobType
    status: JobStatus = JobStatus.PENDING
    title: str = ""
    description: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: float = 0.0  # 0.0 to 1.0
    progress_message: str = ""
    result: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class JobUpdate(BaseModel):
    progress: Optional[float] = None
    progress_message: Optional[str] = None
    status: Optional[JobStatus] = None
    result: Optional[Any] = None
    error: Optional[str] = None


class JobSubmission(BaseModel):
    type: JobType
    title: Optional[str] = None
    description: Optional[str] = None
    metadata: Dict[str, Any] = {}


class JobResponse(BaseModel):
    id: str
    type: JobType
    status: JobStatus
    title: str
    description: str
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: float
    progress_message: str
    result: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}
    
    @classmethod
    def from_job(cls, job: Job) -> 'JobResponse':
        return cls(
            id=job.id,
            type=job.type,
            status=job.status,
            title=job.title,
            description=job.description,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            progress=job.progress,
            progress_message=job.progress_message,
            result=job.result,
            error=job.error,
            metadata=job.metadata
        )


class JobTracker:
    """Simple in-memory job tracker with thread safety"""
    
    def __init__(self, max_completed_jobs: int = 100):
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.RLock()
        self._max_completed_jobs = max_completed_jobs
        
    def create_job(self, job_type: JobType, title: str = "", description: str = "", 
                   metadata: Dict[str, Any] = None) -> str:
        """Create a new job and return its ID"""
        job_id = str(uuid.uuid4())
        
        with self._lock:
            job = Job(
                id=job_id,
                type=job_type,
                title=title or f"{job_type.value} job",
                description=description,
                metadata=metadata or {}
            )
            self._jobs[job_id] = job
            
        return job_id
    
    def get_job(self, job_id: str) -> Optional[Job]:
        """Get a job by ID"""
        with self._lock:
            return self._jobs.get(job_id)
    
    def update_job(self, job_id: str, update: JobUpdate) -> bool:
        """Update a job's status, progress, or result"""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
                
            if update.progress is not None:
                job.progress = max(0.0, min(1.0, update.progress))
                
            if update.progress_message is not None:
                job.progress_message = update.progress_message
                
            if update.status is not None:
                old_status = job.status
                job.status = update.status
                
                # Set timestamps based on status transitions
                if old_status == JobStatus.PENDING and update.status == JobStatus.RUNNING:
                    job.started_at = datetime.now()
                elif update.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                    if not job.completed_at:
                        job.completed_at = datetime.now()
                        
            if update.result is not None:
                job.result = update.result
                
            if update.error is not None:
                job.error = update.error
                
            return True
    
    def start_job(self, job_id: str) -> bool:
        """Mark a job as started/running"""
        return self.update_job(job_id, JobUpdate(status=JobStatus.RUNNING))
    
    def complete_job(self, job_id: str, result: Any = None) -> bool:
        """Mark a job as completed with optional result"""
        return self.update_job(job_id, JobUpdate(
            status=JobStatus.COMPLETED, 
            progress=1.0,
            result=result
        ))
    
    def fail_job(self, job_id: str, error: str) -> bool:
        """Mark a job as failed with error message"""
        return self.update_job(job_id, JobUpdate(
            status=JobStatus.FAILED,
            error=error
        ))
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel a job"""
        return self.update_job(job_id, JobUpdate(status=JobStatus.CANCELLED))
    
    def list_jobs(self, status_filter: Optional[JobStatus] = None, 
                  type_filter: Optional[JobType] = None,
                  limit: Optional[int] = None) -> List[Job]:
        """List jobs with optional filtering"""
        with self._lock:
            jobs = list(self._jobs.values())
            
            if status_filter:
                jobs = [j for j in jobs if j.status == status_filter]
                
            if type_filter:
                jobs = [j for j in jobs if j.type == type_filter]
                
            # Sort by creation date, newest first
            jobs.sort(key=lambda j: j.created_at, reverse=True)
            
            if limit:
                jobs = jobs[:limit]
                
            return jobs
    
    def get_active_jobs(self) -> List[Job]:
        """Get all jobs that are currently pending or running"""
        return self.list_jobs(status_filter=JobStatus.PENDING) + \
               self.list_jobs(status_filter=JobStatus.RUNNING)
    
    def cleanup_old_jobs(self):
        """Remove old completed jobs to prevent memory bloat"""
        with self._lock:
            completed_jobs = [
                job for job in self._jobs.values() 
                if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]
            ]
            
            if len(completed_jobs) > self._max_completed_jobs:
                # Sort by completion date and remove oldest
                completed_jobs.sort(key=lambda j: j.completed_at or j.created_at)
                jobs_to_remove = completed_jobs[:-self._max_completed_jobs]
                
                for job in jobs_to_remove:
                    del self._jobs[job.id]


# Global job tracker instance
job_tracker = JobTracker()


# Decorator to wrap functions as jobs
def as_job(job_type: JobType, title: str = "", description: str = ""):
    """Decorator to automatically wrap a function as a tracked job"""
    def decorator(func: Callable):
        def wrapper(*args, **kwargs):
            # Create job
            job_id = job_tracker.create_job(job_type, title, description)
            
            try:
                # Start job
                job_tracker.start_job(job_id)
                
                # Execute function
                result = func(job_id, *args, **kwargs)
                
                # Complete job
                job_tracker.complete_job(job_id, result)
                return result
                
            except Exception as e:
                # Fail job
                job_tracker.fail_job(job_id, str(e))
                raise
                
        return wrapper
    return decorator


# Context manager for job updates
class JobContext:
    """Context manager for updating job progress and status"""
    
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.tracker = job_tracker
        
    def update_progress(self, progress: float, message: str = ""):
        """Update job progress"""
        self.tracker.update_job(self.job_id, JobUpdate(
            progress=progress, 
            progress_message=message
        ))
        
    def set_status(self, status: JobStatus, message: str = ""):
        """Update job status"""
        self.tracker.update_job(self.job_id, JobUpdate(
            status=status,
            progress_message=message
        ))