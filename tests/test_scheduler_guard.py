import asyncio
from datetime import datetime, timezone

from app.core import scheduler as scheduler_module
from app.core.models import JobSpec, RetryPolicy, Schedule


async def _noop(*args, **kwargs):
    return None


def _job_spec_interval(job_id: str = "job_interval") -> JobSpec:
    return JobSpec(
        job_id=job_id,
        type="agent.workflow",
        schedule=Schedule(interval_sec=1),
        timeout_ms=30000,
        retry_policy=RetryPolicy(max_retry=1, backoff_sec=[1]),
        inputs={"prompt": "x"},
    )


def _job_spec_cron(job_id: str = "job_cron") -> JobSpec:
    return JobSpec(
        job_id=job_id,
        type="agent.workflow",
        schedule=Schedule(cron="* * * * *"),
        timeout_ms=30000,
        retry_policy=RetryPolicy(max_retry=1, backoff_sec=[1]),
        inputs={"prompt": "x"},
    )


def test_scheduler_skips_interval_dispatch_when_previous_run_still_active(monkeypatch):
    sched = scheduler_module.Scheduler()
    sched.jobs = {"job_interval": _job_spec_interval()}

    enqueued = []
    events = []

    async def fake_has_active_runs(job_id: str):
        return True

    async def fake_enqueue_job(event):
        enqueued.append(event)
        return "1-0"

    async def fake_append_event(event_type: str, data):
        events.append((event_type, data))
        return None

    monkeypatch.setattr(scheduler_module, "has_active_runs", fake_has_active_runs)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", fake_append_event)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", lambda run_id: _noop())

    asyncio.run(sched.process_interval_jobs())

    assert enqueued == []
    assert any(name == "scheduler.dispatch_skipped_overlap" for name, _ in events)


def test_scheduler_cron_dispatches_once_per_minute_slot(monkeypatch):
    sched = scheduler_module.Scheduler()
    sched.jobs = {"job_cron": _job_spec_cron()}

    enqueued = []

    async def fake_has_active_runs(job_id: str):
        return False

    async def fake_enqueue_job(event):
        enqueued.append(event)
        return "1-0"

    async def fake_get_run(run_id: str):
        return None

    real_datetime = scheduler_module.datetime

    class _FixedDatetime:
        @classmethod
        def now(cls, tz=None):
            dt = real_datetime(2026, 2, 22, 1, 50, 5, tzinfo=timezone.utc)
            if tz is None:
                return dt.replace(tzinfo=None)
            return dt.astimezone(tz)

        @classmethod
        def fromisoformat(cls, value: str):
            return real_datetime.fromisoformat(value)

    monkeypatch.setattr(scheduler_module, "datetime", _FixedDatetime)
    monkeypatch.setattr(scheduler_module, "has_active_runs", fake_has_active_runs)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", _noop)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", fake_get_run)

    asyncio.run(sched.process_cron_jobs())
    asyncio.run(sched.process_cron_jobs())

    assert len(enqueued) == 1


def test_scheduler_cron_match_handles_common_daily_expression():
    sched = scheduler_module.Scheduler()

    jam_tujuh = datetime(2026, 2, 22, 7, 0, 0, tzinfo=timezone.utc)
    jam_tujuh_lewat = datetime(2026, 2, 22, 7, 1, 0, tzinfo=timezone.utc)

    assert sched._cron_match("0 7 * * *", jam_tujuh) is True
    assert sched._cron_match("0 7 * * *", jam_tujuh_lewat) is False
