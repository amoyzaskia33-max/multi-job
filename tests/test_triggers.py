import asyncio

import pytest
from redis.exceptions import RedisError

from app.core import triggers


class _FailingRedis:
    async def get(self, *args, **kwargs):
        raise RedisError("redis unavailable")

    async def set(self, *args, **kwargs):
        raise RedisError("redis unavailable")

    async def sadd(self, *args, **kwargs):
        raise RedisError("redis unavailable")

    async def smembers(self, *args, **kwargs):
        raise RedisError("redis unavailable")

    async def delete(self, *args, **kwargs):
        raise RedisError("redis unavailable")

    async def srem(self, *args, **kwargs):
        raise RedisError("redis unavailable")


async def _noop_append_event(*args, **kwargs):
    return None


def test_upsert_and_list_trigger(monkeypatch):
    monkeypatch.setattr(triggers, "redis_client", _FailingRedis())

    async def fake_get_job_spec(job_id: str):
        return {"job_id": job_id, "type": "agent.workflow", "inputs": {"default": True}}

    monkeypatch.setattr(triggers, "get_job_spec", fake_get_job_spec)

    async def run_case():
        row = await triggers.upsert_trigger(
            "alert_webhook",
            {
                "name": "Alert webhook",
                "job_id": "job_alert",
                "channel": "webhook",
                "description": "Fire on webhook",
                "default_payload": {"env": "prod"},
            },
        )

        assert row["trigger_id"] == "alert_webhook"
        assert row["channel"] == "webhook"
        assert row["default_payload"]["env"] == "prod"

        daftar = await triggers.list_triggers()
        assert len(daftar) == 1
        assert daftar[0]["trigger_id"] == "alert_webhook"

    asyncio.run(run_case())


def test_fire_trigger_enqueues_job(monkeypatch):
    monkeypatch.setattr(triggers, "redis_client", _FailingRedis())

    async def fake_get_job_spec(job_id: str):
        return {
            "job_id": job_id,
            "type": "agent.workflow",
            "inputs": {"initial": True},
            "timeout_ms": 1000,
        }

    captured_event = {}

    async def fake_enqueue_job(event):
        captured_event["event"] = event
        return "msg-1"

    monkeypatch.setattr(triggers, "get_job_spec", fake_get_job_spec)
    monkeypatch.setattr(triggers, "enqueue_job", fake_enqueue_job)
    monkeypatch.setattr(triggers, "append_event", _noop_append_event)

    async def run_case():
        await triggers.upsert_trigger(
            "alert_webhook",
            {
                "name": "Alert webhook",
                "job_id": "job_alert",
                "channel": "webhook",
                "description": "Fire on webhook",
                "default_payload": {"env": "prod"},
            },
        )

        result = await triggers.fire_trigger("alert_webhook", payload={"user": "alice"}, source="webhook.ping")

        assert result["message_id"] == "msg-1"
        assert result["channel"] == "webhook"
        assert result["job_id"] == "job_alert"
        assert captured_event["event"].inputs["env"] == "prod"
        assert captured_event["event"].inputs["user"] == "alice"
        assert captured_event["event"].inputs["trigger_id"] == "alert_webhook"
        assert captured_event["event"].inputs["trigger_source"] == "webhook.ping"

    asyncio.run(run_case())
