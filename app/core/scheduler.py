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
    is_mode_fallback_redis,
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
        daftar_id_job = await list_enabled_job_ids()
        job_terbaru: Dict[str, JobSpec] = {}
        for job_id in daftar_id_job:
            spesifikasi = await get_job_spec(job_id)
            if spesifikasi:
                job_terbaru[job_id] = JobSpec(**spesifikasi)
        self.jobs = job_terbaru

    async def heartbeat(self):
        if is_mode_fallback_redis():
            return

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
        putaran = 0
        while self.running:
            await self.heartbeat()
            if putaran % 5 == 0:
                await self.load_jobs()
            await self.process_interval_jobs()
            await self.process_due_jobs()
            putaran += 1
            await asyncio.sleep(1)  # Check every second

    async def stop(self):
        """Stop the scheduler."""
        self.running = False

    async def process_interval_jobs(self):
        """Process jobs with interval scheduling."""
        sekarang = datetime.now(timezone.utc)
        waktu_sekarang_ts = time.time()

        for job_id, spesifikasi in self.jobs.items():
            if not spesifikasi.schedule or not spesifikasi.schedule.interval_sec:
                continue

            interval_detik = max(1, int(spesifikasi.schedule.interval_sec))
            waktu_dispatch_terakhir = self.last_dispatch.get(job_id, 0)
            if waktu_sekarang_ts - waktu_dispatch_terakhir < interval_detik:
                continue

            run_id = f"run_{int(waktu_sekarang_ts)}_{uuid.uuid4().hex[:8]}"
            event_antrean = QueueEvent(
                run_id=run_id,
                job_id=job_id,
                type=spesifikasi.type,
                inputs=spesifikasi.inputs,
                attempt=0,
                scheduled_at=sekarang.isoformat(),
                timeout_ms=spesifikasi.timeout_ms,
                trace_id=f"trace_{uuid.uuid4().hex}",
            )

            await enqueue_job(event_antrean)
            await append_event(
                "run.queued",
                {"run_id": run_id, "job_id": job_id, "job_type": spesifikasi.type, "source": "scheduler"},
            )
            self.last_dispatch[job_id] = waktu_sekarang_ts

    async def process_due_jobs(self):
        """Move delayed jobs into stream when due."""
        job_jatuh_tempo = await get_due_jobs()
        for job in job_jatuh_tempo:
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
