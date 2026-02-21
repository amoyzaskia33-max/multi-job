import asyncio
from datetime import datetime, timezone

from redis.exceptions import RedisError

from app.core import queue
from app.core.models import Run, RunStatus


class _MustNotCallRedis:
    def __getattr__(self, name):
        async def _raise(*args, **kwargs):
            raise AssertionError(f"Redis method should not be called in fallback mode: {name}")

        return _raise


class _FailingRedisOnXadd:
    def __init__(self):
        self.xadd_calls = 0

    async def xadd(self, *args, **kwargs):
        self.xadd_calls += 1
        raise RedisError("redis unavailable")


def _reset_queue_fallback_state():
    queue.set_mode_fallback_redis(False)
    queue._fallback_stream.clear()
    queue._fallback_delayed.clear()
    queue._fallback_job_specs.clear()
    queue._fallback_job_all.clear()
    queue._fallback_job_enabled.clear()
    queue._fallback_runs.clear()
    queue._fallback_run_scores.clear()
    queue._fallback_job_runs.clear()
    queue._fallback_events.clear()


def test_queue_fallback_mode_short_circuits_redis(monkeypatch):
    _reset_queue_fallback_state()
    monkeypatch.setattr(queue, "redis_client", _MustNotCallRedis())
    queue.set_mode_fallback_redis(True)

    message_id = asyncio.run(
        queue.enqueue_job(
            {
                "run_id": "run_1",
                "job_id": "job_1",
                "type": "monitor.channel",
                "inputs": {},
                "attempt": 0,
            }
        )
    )
    assert message_id

    dequeued = asyncio.run(queue.dequeue_job("worker_1"))
    assert dequeued is not None
    assert dequeued["data"]["job_id"] == "job_1"

    asyncio.run(queue.save_job_spec("job_1", {"job_id": "job_1", "type": "monitor.channel"}))
    spec = asyncio.run(queue.get_job_spec("job_1"))
    assert spec is not None
    assert spec["job_id"] == "job_1"

    asyncio.run(queue.enable_job("job_1"))
    assert asyncio.run(queue.is_job_enabled("job_1")) is True
    assert asyncio.run(queue.list_enabled_job_ids()) == ["job_1"]

    run = Run(
        run_id="run_1",
        job_id="job_1",
        status=RunStatus.QUEUED,
        attempt=0,
        scheduled_at=datetime.now(timezone.utc),
        inputs={},
    )
    asyncio.run(queue.save_run(run))
    loaded = asyncio.run(queue.get_run("run_1"))
    assert loaded is not None
    assert loaded.run_id == "run_1"

    asyncio.run(queue.append_event("test.event", {"ok": True}))
    events = asyncio.run(queue.get_events(limit=10))
    assert len(events) == 1
    assert events[0]["type"] == "test.event"


def test_queue_auto_switches_to_fallback_after_redis_error(monkeypatch):
    _reset_queue_fallback_state()
    redis_fail = _FailingRedisOnXadd()
    monkeypatch.setattr(queue, "redis_client", redis_fail)

    assert queue.is_mode_fallback_redis() is False

    first_id = asyncio.run(
        queue.enqueue_job(
            {
                "run_id": "run_a",
                "job_id": "job_a",
                "type": "monitor.channel",
                "inputs": {},
                "attempt": 0,
            }
        )
    )
    assert first_id
    assert redis_fail.xadd_calls == 1
    assert queue.is_mode_fallback_redis() is True

    second_id = asyncio.run(
        queue.enqueue_job(
            {
                "run_id": "run_b",
                "job_id": "job_b",
                "type": "monitor.channel",
                "inputs": {},
                "attempt": 0,
            }
        )
    )
    assert second_id
    assert redis_fail.xadd_calls == 1
