import asyncio

from app.core import queue


class _MustNotCallRedis:
    def __getattr__(self, name):
        async def _raise(*args, **kwargs):
            raise AssertionError(f"Redis method should not be called in fallback mode: {name}")

        return _raise


def _reset_queue_fallback_state():
    queue.set_mode_fallback_redis(False)
    queue._fallback_stream.clear()
    queue._fallback_delayed.clear()
    queue._fallback_job_specs.clear()
    queue._fallback_job_all.clear()
    queue._fallback_job_enabled.clear()
    queue._fallback_job_spec_versions.clear()
    queue._fallback_runs.clear()
    queue._fallback_run_scores.clear()
    queue._fallback_job_runs.clear()
    queue._fallback_active_runs.clear()
    queue._fallback_active_flow_runs.clear()
    queue._fallback_failure_state.clear()
    queue._fallback_events.clear()


def test_save_job_spec_creates_versions_in_fallback(monkeypatch):
    _reset_queue_fallback_state()
    monkeypatch.setattr(queue, "redis_client", _MustNotCallRedis())
    queue.set_mode_fallback_redis(True)

    spec_v1 = {"job_id": "job_ver_1", "type": "monitor.channel", "timeout_ms": 1000, "inputs": {"a": 1}}
    spec_v2 = {"job_id": "job_ver_1", "type": "monitor.channel", "timeout_ms": 2000, "inputs": {"a": 2}}

    asyncio.run(queue.save_job_spec("job_ver_1", spec_v1, source="test", actor="tester", note="v1"))
    asyncio.run(queue.save_job_spec("job_ver_1", spec_v2, source="test", actor="tester", note="v2"))

    versions = asyncio.run(queue.list_job_spec_versions("job_ver_1", limit=10))
    assert len(versions) == 2
    assert versions[0]["spec"]["timeout_ms"] == 2000
    assert versions[1]["spec"]["timeout_ms"] == 1000
    assert versions[0]["source"] == "test"
    assert versions[0]["actor"] == "tester"


def test_rollback_job_spec_to_previous_version(monkeypatch):
    _reset_queue_fallback_state()
    monkeypatch.setattr(queue, "redis_client", _MustNotCallRedis())
    queue.set_mode_fallback_redis(True)

    spec_v1 = {"job_id": "job_ver_rollback", "type": "monitor.channel", "timeout_ms": 3000, "inputs": {"step": 1}}
    spec_v2 = {"job_id": "job_ver_rollback", "type": "monitor.channel", "timeout_ms": 9000, "inputs": {"step": 2}}

    asyncio.run(queue.save_job_spec("job_ver_rollback", spec_v1, source="test", note="v1"))
    asyncio.run(queue.save_job_spec("job_ver_rollback", spec_v2, source="test", note="v2"))

    versions = asyncio.run(queue.list_job_spec_versions("job_ver_rollback", limit=10))
    old_version_id = versions[1]["version_id"]

    restored = asyncio.run(
        queue.rollback_job_spec_to_version(
            "job_ver_rollback",
            old_version_id,
            source="api.rollback",
            actor="admin",
            note="manual rollback test",
        )
    )

    assert restored is not None
    assert restored["timeout_ms"] == 3000
    current = asyncio.run(queue.get_job_spec("job_ver_rollback"))
    assert current is not None
    assert current["inputs"]["step"] == 1

    versions_after = asyncio.run(queue.list_job_spec_versions("job_ver_rollback", limit=10))
    assert len(versions_after) == 3
    assert versions_after[0]["source"] == "api.rollback"
    assert versions_after[0]["actor"] == "admin"
