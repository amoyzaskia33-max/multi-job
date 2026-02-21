import asyncio
from datetime import datetime, timezone

from app.core import scheduler as scheduler_module
from app.core.models import JobSpec, RetryPolicy, Schedule


async def _noop(*args, **kwargs):
    return None


def _patch_guard_defaults(monkeypatch):
    async def _no_pending(job_id: str):
        return False

    async def _no_cooldown(job_id: str):
        return 0

    async def _no_active(job_id: str):
        return False

    async def _no_flow_active(flow_group: str):
        return 0

    monkeypatch.setattr(scheduler_module, "has_pending_approval_for_job", _no_pending)
    monkeypatch.setattr(scheduler_module, "get_job_cooldown_remaining", _no_cooldown)
    monkeypatch.setattr(scheduler_module, "count_active_runs_for_flow_group", _no_flow_active)


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
    _patch_guard_defaults(monkeypatch)
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
    _patch_guard_defaults(monkeypatch)
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


def test_scheduler_initial_jitter_offsets_first_interval_dispatch(monkeypatch):
    _patch_guard_defaults(monkeypatch)
    sched = scheduler_module.Scheduler()
    spec = JobSpec(
        job_id="job_jitter",
        type="agent.workflow",
        schedule=Schedule(interval_sec=10),
        timeout_ms=30000,
        retry_policy=RetryPolicy(max_retry=1, backoff_sec=[1]),
        inputs={"prompt": "x", "dispatch_jitter_sec": 9},
    )
    sched.jobs = {"job_jitter": spec}

    enqueued = []

    async def fake_has_active_runs(job_id: str):
        return False

    async def fake_enqueue_job(event):
        enqueued.append(event)
        return "1-0"

    async def fake_get_run(run_id: str):
        return None

    monkeypatch.setattr(scheduler_module, "has_active_runs", fake_has_active_runs)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", _noop)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", fake_get_run)
    monkeypatch.setattr(
        scheduler_module.Scheduler,
        "_hitung_offset_jitter_awal",
        staticmethod(lambda job_id, interval_detik, spesifikasi: 5),
    )

    fake_now = {"value": 1000.0}
    monkeypatch.setattr(scheduler_module.time, "time", lambda: fake_now["value"])

    asyncio.run(sched.process_interval_jobs())
    assert len(enqueued) == 0

    fake_now["value"] = 1006.0
    asyncio.run(sched.process_interval_jobs())
    assert len(enqueued) == 1


def test_scheduler_skips_dispatch_when_pending_approval_exists(monkeypatch):
    _patch_guard_defaults(monkeypatch)
    sched = scheduler_module.Scheduler()
    sched.jobs = {"job_pending": _job_spec_interval("job_pending")}

    events = []

    async def _pending(job_id: str):
        return True

    async def _no_cooldown(job_id: str):
        return 0

    async def _no_active(job_id: str):
        return False

    async def fake_enqueue_job(event):
        raise AssertionError("enqueue should not be called when approval is pending")

    async def fake_append_event(event_type: str, data):
        events.append((event_type, data))
        return None

    monkeypatch.setattr(scheduler_module, "has_pending_approval_for_job", _pending)
    monkeypatch.setattr(scheduler_module, "get_job_cooldown_remaining", _no_cooldown)
    monkeypatch.setattr(scheduler_module, "has_active_runs", _no_active)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", fake_append_event)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", lambda run_id: _noop())

    asyncio.run(sched.process_interval_jobs())

    assert any(name == "scheduler.dispatch_skipped_pending_approval" for name, _ in events)


def test_scheduler_skips_dispatch_when_job_in_cooldown(monkeypatch):
    _patch_guard_defaults(monkeypatch)
    sched = scheduler_module.Scheduler()
    sched.jobs = {"job_cooldown": _job_spec_interval("job_cooldown")}

    events = []

    async def _no_pending(job_id: str):
        return False

    async def _cooldown(job_id: str):
        return 45

    async def _no_active(job_id: str):
        return False

    async def fake_enqueue_job(event):
        raise AssertionError("enqueue should not be called when cooldown is active")

    async def fake_append_event(event_type: str, data):
        events.append((event_type, data))
        return None

    monkeypatch.setattr(scheduler_module, "has_pending_approval_for_job", _no_pending)
    monkeypatch.setattr(scheduler_module, "get_job_cooldown_remaining", _cooldown)
    monkeypatch.setattr(scheduler_module, "has_active_runs", _no_active)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", fake_append_event)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", lambda run_id: _noop())

    asyncio.run(sched.process_interval_jobs())

    assert any(name == "scheduler.dispatch_skipped_cooldown" for name, _ in events)


def test_scheduler_skips_non_critical_during_pressure_mode(monkeypatch):
    _patch_guard_defaults(monkeypatch)
    sched = scheduler_module.Scheduler()
    sched.jobs = {"job_pressure": _job_spec_interval("job_pressure")}
    sched.pressure_mode = True
    sched.queue_depth_snapshot = 999
    sched.queue_delayed_snapshot = 12

    events = []

    async def _no_active(job_id: str):
        return False

    async def fake_enqueue_job(event):
        raise AssertionError("enqueue should not be called for non-critical job during pressure mode")

    async def fake_append_event(event_type: str, data):
        events.append((event_type, data))
        return None

    monkeypatch.setattr(scheduler_module, "has_active_runs", _no_active)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", fake_append_event)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", lambda run_id: _noop())

    asyncio.run(sched.process_interval_jobs())

    assert any(name == "scheduler.dispatch_skipped_pressure" for name, _ in events)


def test_scheduler_allows_critical_job_during_pressure_mode(monkeypatch):
    _patch_guard_defaults(monkeypatch)
    sched = scheduler_module.Scheduler()
    spec = JobSpec(
        job_id="job_critical",
        type="agent.workflow",
        schedule=Schedule(interval_sec=1),
        timeout_ms=30000,
        retry_policy=RetryPolicy(max_retry=1, backoff_sec=[1]),
        inputs={"prompt": "x", "pressure_priority": "critical"},
    )
    sched.jobs = {"job_critical": spec}
    sched.pressure_mode = True
    sched.queue_depth_snapshot = 999
    sched.queue_delayed_snapshot = 12

    enqueued = []

    async def _no_active(job_id: str):
        return False

    async def fake_enqueue_job(event):
        enqueued.append(event)
        return "1-0"

    monkeypatch.setattr(scheduler_module, "has_active_runs", _no_active)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", _noop)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", lambda run_id: _noop())

    asyncio.run(sched.process_interval_jobs())

    assert len(enqueued) == 1


def test_scheduler_respects_dispatch_cap_per_tick(monkeypatch):
    _patch_guard_defaults(monkeypatch)
    sched = scheduler_module.Scheduler()
    sched.max_dispatch_per_tick = 1
    sched.jobs = {
        "job_a": _job_spec_interval("job_a"),
        "job_b": _job_spec_interval("job_b"),
    }

    enqueued = []
    events = []

    async def _no_active(job_id: str):
        return False

    async def fake_enqueue_job(event):
        enqueued.append(event)
        return "1-0"

    async def fake_append_event(event_type: str, data):
        events.append((event_type, data))
        return None

    monkeypatch.setattr(scheduler_module, "has_active_runs", _no_active)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", fake_append_event)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", lambda run_id: _noop())

    asyncio.run(sched.process_interval_jobs())

    assert len(enqueued) == 1
    assert any(name == "scheduler.dispatch_capped" for name, _ in events)


def test_scheduler_skips_dispatch_when_flow_limit_reached(monkeypatch):
    _patch_guard_defaults(monkeypatch)
    sched = scheduler_module.Scheduler()
    spec = JobSpec(
        job_id="job_flow_cap",
        type="agent.workflow",
        schedule=Schedule(interval_sec=1),
        timeout_ms=30000,
        retry_policy=RetryPolicy(max_retry=1, backoff_sec=[1]),
        inputs={"prompt": "x", "flow_group": "tim_a", "flow_max_active_runs": 2},
    )
    sched.jobs = {"job_flow_cap": spec}

    events = []

    async def _no_active(job_id: str):
        return False

    async def _flow_cap(group: str):
        assert group == "tim_a"
        return 2

    async def fake_enqueue_job(event):
        raise AssertionError("enqueue should not be called when flow limit is reached")

    async def fake_append_event(event_type: str, data):
        events.append((event_type, data))
        return None

    monkeypatch.setattr(scheduler_module, "has_active_runs", _no_active)
    monkeypatch.setattr(scheduler_module, "count_active_runs_for_flow_group", _flow_cap)
    monkeypatch.setattr(scheduler_module, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(scheduler_module, "append_event", fake_append_event)
    monkeypatch.setattr(scheduler_module, "save_run", _noop)
    monkeypatch.setattr(scheduler_module, "add_run_to_job_history", _noop)
    monkeypatch.setattr(scheduler_module, "get_run", lambda run_id: _noop())

    asyncio.run(sched.process_interval_jobs())

    assert any(name == "scheduler.dispatch_skipped_flow_limit" for name, _ in events)
