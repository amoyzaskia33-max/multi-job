import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import Dict

from .models import JobSpec, QueueEvent
from .queue import (
    append_event,
    enqueue_job,
    get_due_jobs,
    list_enabled_job_ids,
    get_job_spec,
)
from .redis_client import redis_client


AGENT_HEARTBEAT_TTL = 30


class Scheduler:
    def __init__(self):
        self.jobs: Dict[str, JobSpec] = {}
        self.running = False
        self.last_dispatch: Dict[str, float] = {}
        self.scheduler_id = f"scheduler_{int(time.time())}"

    async def load_jobs(self):
        """Load all enabled jobs from Redis."""
        job_ids = await list_enabled_job_ids()
        fresh_jobs: Dict[str, JobSpec] = {}
        for job_id in job_ids:
            spec_dict = await get_job_spec(job_id)
            if spec_dict:
                fresh_jobs[job_id] = JobSpec(**spec_dict)
        self.jobs = fresh_jobs

    async def heartbeat(self):
        try:
            await redis_client.setex(
                f"hb:agent:scheduler:{self.scheduler_id}",
                AGENT_HEARTBEAT_TTL,
                datetime.now(timezone.utc).isoformat(),
            )
        except Exception:
            # In local fallback mode Redis may be unavailable.
            return

    async def start(self):
        """Start the scheduler loop."""
        self.running = True
        await self.load_jobs()
        tick = 0
        while self.running:
            await self.heartbeat()
            if tick % 5 == 0:
                await self.load_jobs()
            await self.process_interval_jobs()
            await self.process_due_jobs()
            tick += 1
            await asyncio.sleep(1)  # Check every second

    async def stop(self):
        """Stop the scheduler."""
        self.running = False

    async def process_interval_jobs(self):
        """Process jobs with interval scheduling."""
        now = datetime.now(timezone.utc)
        now_ts = time.time()

        for job_id, spec in self.jobs.items():
            if not spec.schedule or not spec.schedule.interval_sec:
                continue

            interval = max(1, int(spec.schedule.interval_sec))
            last_ts = self.last_dispatch.get(job_id, 0)
            if now_ts - last_ts < interval:
                continue

            run_id = f"run_{int(now_ts)}_{uuid.uuid4().hex[:8]}"
            event = QueueEvent(
                run_id=run_id,
                job_id=job_id,
                type=spec.type,
                inputs=spec.inputs,
                attempt=0,
                scheduled_at=now.isoformat(),
                timeout_ms=spec.timeout_ms,
                trace_id=f"trace_{uuid.uuid4().hex}",
            )

            await enqueue_job(event)
            await append_event(
                "run.queued",
                {"run_id": run_id, "job_id": job_id, "job_type": spec.type, "source": "scheduler"},
            )
            self.last_dispatch[job_id] = now_ts

    async def process_due_jobs(self):
        """Move delayed jobs into stream when due."""
        due_jobs = await get_due_jobs()
        for job in due_jobs:
            await enqueue_job(job)
            await append_event(
                "run.queued",
                {
                    "run_id": job.get("run_id"),
                    "job_id": job.get("job_id"),
                    "job_type": job.get("type"),
                    "source": "retry",
                },
            )
