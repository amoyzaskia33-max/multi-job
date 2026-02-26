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
    agent_pool: Optional[str] = None
    priority: int = Field(default=0)
    concurrency_key: Optional[str] = None

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
    agent_pool: Optional[str] = None

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
    agent_pool: Optional[str] = None
    priority: int = 0

# Trigger models
class Trigger(BaseModel):
    trigger_id: str
    name: str
    job_id: str
    channel: str
    description: Optional[str] = None
    enabled: bool = True
    default_payload: Dict[str, Any] = Field(default_factory=dict)
    secret: Optional[str] = None
    requires_approval: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_fired_run_id: Optional[str] = None
    last_fired_at: Optional[str] = None

class TriggerPayload(BaseModel):
    name: Optional[str] = None
    job_id: Optional[str] = None
    channel: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    default_payload: Optional[Dict[str, Any]] = None
    secret: Optional[str] = None
    requires_approval: Optional[bool] = None

# Holding Company Models (Phase 14)
class Squad(BaseModel):
    hunter_job_id: Optional[str] = None
    marketer_job_id: Optional[str] = None
    closer_job_id: Optional[str] = None

class Branch(BaseModel):
    branch_id: str
    name: str
    status: str = "active" # active, paused, closed
    blueprint_id: str
    target_kpi: Dict[str, Any] = Field(default_factory=dict)
    current_metrics: Dict[str, Any] = Field(default_factory=dict)
    squad: Squad = Field(default_factory=Squad)
    created_at: str
    updated_at: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

class BranchBlueprint(BaseModel):
    blueprint_id: str
    name: str
    description: str
    base_strategy: str
    default_jobs: List[Dict[str, Any]] = Field(default_factory=list) # Specs for Hunter, Marketer, Closer
