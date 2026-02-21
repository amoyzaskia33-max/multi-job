import asyncio
import hashlib
import time
import uuid
from datetime import datetime, timezone
from typing import Dict

from .models import JobSpec, QueueEvent, Run, RunStatus
from .queue import (
    add_run_to_job_history,
    append_event,
    enqueue_job,
    get_due_jobs,
    get_run,
    has_active_runs,
    list_enabled_job_ids,
    get_job_spec,
    is_mode_fallback_redis,
    save_run,
)
from .redis_client import redis_client


AGENT_HEARTBEAT_TTL = 30


class Scheduler:
    def __init__(self):
        self.jobs: Dict[str, JobSpec] = {}
        self.running = False
        self.last_dispatch: Dict[str, float] = {}
        self.last_cron_slot: Dict[str, str] = {}
        self.last_overlap_notice: Dict[str, float] = {}
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

        # Cleanup stale state for removed/disabled jobs.
        valid_job_ids = set(job_terbaru.keys())
        self.last_dispatch = {job_id: value for job_id, value in self.last_dispatch.items() if job_id in valid_job_ids}
        self.last_cron_slot = {job_id: value for job_id, value in self.last_cron_slot.items() if job_id in valid_job_ids}
        self.last_overlap_notice = {
            job_id: value for job_id, value in self.last_overlap_notice.items() if job_id in valid_job_ids
        }

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
            await self.process_cron_jobs()
            await self.process_due_jobs()
            putaran += 1
            await asyncio.sleep(1)  # Check every second

    async def stop(self):
        """Stop the scheduler."""
        self.running = False

    @staticmethod
    def _job_izinkan_overlap(spesifikasi: JobSpec) -> bool:
        inputs = spesifikasi.inputs if isinstance(spesifikasi.inputs, dict) else {}
        return bool(inputs.get("allow_overlap", False))

    @staticmethod
    def _hitung_offset_jitter_awal(job_id: str, interval_detik: int, spesifikasi: JobSpec) -> int:
        if interval_detik <= 1:
            return 0
        inputs = spesifikasi.inputs if isinstance(spesifikasi.inputs, dict) else {}
        try:
            jitter_detik = int(inputs.get("dispatch_jitter_sec", 0))
        except Exception:
            jitter_detik = 0
        jitter_detik = max(0, min(jitter_detik, interval_detik - 1))
        if jitter_detik <= 0:
            return 0
        digest = hashlib.sha1(job_id.encode("utf-8")).hexdigest()
        return int(digest[:8], 16) % (jitter_detik + 1)

    async def _boleh_dispatch_job(self, job_id: str, spesifikasi: JobSpec) -> bool:
        if self._job_izinkan_overlap(spesifikasi):
            return True

        aktif = await has_active_runs(job_id)
        if not aktif:
            return True

        sekarang_ts = time.time()
        terakhir_notice = self.last_overlap_notice.get(job_id, 0.0)
        if sekarang_ts - terakhir_notice >= 15:
            await append_event(
                "scheduler.dispatch_skipped_overlap",
                {
                    "job_id": job_id,
                    "job_type": spesifikasi.type,
                    "message": "Dispatch dilewati karena run sebelumnya belum selesai.",
                },
            )
            self.last_overlap_notice[job_id] = sekarang_ts

        return False

    @staticmethod
    def _normalisasi_weekday(dt: datetime) -> int:
        # Python Monday=0..Sunday=6 -> Cron Sunday=0..Saturday=6
        return (dt.weekday() + 1) % 7

    @staticmethod
    def _parse_cron_field(field: str, minimum: int, maximum: int, normalize_weekday: bool = False) -> set:
        cleaned = field.strip()
        if not cleaned:
            raise ValueError("field cron kosong")

        hasil: set = set()
        parts = [part.strip() for part in cleaned.split(",") if part.strip()]
        if not parts:
            raise ValueError("field cron kosong")

        for part in parts:
            step = 1
            base = part
            if "/" in part:
                base, step_raw = part.split("/", 1)
                try:
                    step = int(step_raw)
                except ValueError as exc:
                    raise ValueError(f"step cron tidak valid: {part}") from exc
                if step <= 0:
                    raise ValueError(f"step cron harus > 0: {part}")

            def _add_range(start: int, end: int):
                for value in range(start, end + 1, step):
                    hasil.add(value)

            if base == "*":
                _add_range(minimum, maximum)
            elif "-" in base:
                start_raw, end_raw = base.split("-", 1)
                start = int(start_raw)
                end = int(end_raw)
                if normalize_weekday:
                    if start == 7:
                        start = 0
                    if end == 7:
                        end = 0
                if start > end:
                    raise ValueError(f"range cron tidak valid: {part}")
                _add_range(start, end)
            else:
                value = int(base)
                if normalize_weekday and value == 7:
                    value = 0
                hasil.add(value)

        for value in hasil:
            if value < minimum or value > maximum:
                raise ValueError(f"nilai cron di luar batas: {value}")

        return hasil

    def _cron_match(self, cron_expr: str, dt: datetime) -> bool:
        fields = [field for field in cron_expr.strip().split() if field]
        if len(fields) != 5:
            return False

        try:
            menit = self._parse_cron_field(fields[0], 0, 59)
            jam = self._parse_cron_field(fields[1], 0, 23)
            hari_bulan = self._parse_cron_field(fields[2], 1, 31)
            bulan = self._parse_cron_field(fields[3], 1, 12)
            hari_pekan = self._parse_cron_field(fields[4], 0, 7, normalize_weekday=True)
        except ValueError:
            return False

        return (
            dt.minute in menit
            and dt.hour in jam
            and dt.day in hari_bulan
            and dt.month in bulan
            and self._normalisasi_weekday(dt) in hari_pekan
        )

    @staticmethod
    def _datetime_dari_iso(raw: str) -> datetime:
        try:
            parsed = datetime.fromisoformat(raw)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            return datetime.now(timezone.utc)

    async def _simpan_run_queued(self, event_antrean: QueueEvent):
        data_run = await get_run(event_antrean.run_id)
        if not data_run:
            data_run = Run(
                run_id=event_antrean.run_id,
                job_id=event_antrean.job_id,
                status=RunStatus.QUEUED,
                attempt=event_antrean.attempt,
                scheduled_at=self._datetime_dari_iso(event_antrean.scheduled_at),
                inputs=event_antrean.inputs,
                trace_id=event_antrean.trace_id,
            )
        else:
            data_run.status = RunStatus.QUEUED
            data_run.attempt = event_antrean.attempt
            data_run.scheduled_at = self._datetime_dari_iso(event_antrean.scheduled_at)
            data_run.inputs = event_antrean.inputs or {}
            data_run.trace_id = event_antrean.trace_id
            data_run.started_at = None
            data_run.finished_at = None
            data_run.result = None

        await save_run(data_run)
        await add_run_to_job_history(event_antrean.job_id, event_antrean.run_id)

    async def process_interval_jobs(self):
        """Process jobs with interval scheduling."""
        sekarang = datetime.now(timezone.utc)
        waktu_sekarang_ts = time.time()

        for job_id, spesifikasi in self.jobs.items():
            if not spesifikasi.schedule or not spesifikasi.schedule.interval_sec:
                continue

            interval_detik = max(1, int(spesifikasi.schedule.interval_sec))
            if job_id not in self.last_dispatch:
                offset_awal = self._hitung_offset_jitter_awal(job_id, interval_detik, spesifikasi)
                if offset_awal > 0:
                    self.last_dispatch[job_id] = waktu_sekarang_ts - interval_detik + offset_awal

            waktu_dispatch_terakhir = self.last_dispatch.get(job_id, 0)
            if waktu_sekarang_ts - waktu_dispatch_terakhir < interval_detik:
                continue
            if not await self._boleh_dispatch_job(job_id, spesifikasi):
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

            await self._simpan_run_queued(event_antrean)
            await enqueue_job(event_antrean)
            await append_event(
                "run.queued",
                {"run_id": run_id, "job_id": job_id, "job_type": spesifikasi.type, "source": "scheduler"},
            )
            self.last_dispatch[job_id] = waktu_sekarang_ts

    async def process_cron_jobs(self):
        """Process jobs with cron scheduling."""
        sekarang = datetime.now(timezone.utc)
        slot_menit = sekarang.strftime("%Y%m%d%H%M")

        for job_id, spesifikasi in self.jobs.items():
            cron_expr = spesifikasi.schedule.cron if spesifikasi.schedule else None
            if not cron_expr:
                continue
            if not self._cron_match(str(cron_expr), sekarang):
                continue

            slot_terakhir = self.last_cron_slot.get(job_id)
            if slot_terakhir == slot_menit:
                continue
            if not await self._boleh_dispatch_job(job_id, spesifikasi):
                continue

            run_id = f"run_{int(time.time())}_{uuid.uuid4().hex[:8]}"
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

            await self._simpan_run_queued(event_antrean)
            await enqueue_job(event_antrean)
            await append_event(
                "run.queued",
                {"run_id": run_id, "job_id": job_id, "job_type": spesifikasi.type, "source": "scheduler_cron"},
            )
            self.last_cron_slot[job_id] = slot_menit

    async def process_due_jobs(self):
        """Move delayed jobs into stream when due."""
        job_jatuh_tempo = await get_due_jobs()
        for job in job_jatuh_tempo:
            event_antrean = QueueEvent(**job)
            await self._simpan_run_queued(event_antrean)
            await enqueue_job(event_antrean)
            await append_event(
                "run.queued",
                {
                    "run_id": job.get("run_id"),
                    "job_id": job.get("job_id"),
                    "job_type": job.get("type"),
                    "source": "retry",
                },
            )
