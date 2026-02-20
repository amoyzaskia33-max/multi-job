from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

# Job specification model
class RetryPolicy(BaseModel):
    max_retry: int = 3
    backoff_sec: List[int] = Field(default_factory=lambda: [1, 2, 5])

class Schedule(BaseModel):
    cron: Optional[str] = None
    interval_sec: Optional[int] = None

class JobSpec(BaseModel):
    job_id: str
    type: str
    schedule: Optional[Schedule] = None
    timeout_ms: int = 30000  # 30 seconds default
    retry_policy: RetryPolicy = Field(default_factory=RetryPolicy)
    inputs: Dict[str, Any] = Field(default_factory=dict)

# Run status model
class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"

class RunResult(BaseModel):
    success: bool
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None

class Run(BaseModel):
    run_id: str
    job_id: str
    status: RunStatus = RunStatus.QUEUED
    attempt: int = 0
    scheduled_at: datetime
    inputs: Dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    result: Optional[RunResult] = None
    trace_id: Optional[str] = None

# Queue event model (for Redis Streams)
class QueueEvent(BaseModel):
    run_id: str
    job_id: str
    type: str
    inputs: Dict[str, Any]
    attempt: int
    scheduled_at: str  # ISO format string
    timeout_ms: Optional[int] = None
    trace_id: Optional[str] = None
