import asyncio
from types import SimpleNamespace

from redis.exceptions import TimeoutError as RedisTimeoutError

from app.jobs.handlers import monitor_channel


class _DummyMetrics:
    def increment(self, *_args, **_kwargs):
        return None


class _FailingRedis:
    async def get(self, *_args, **_kwargs):
        raise RedisTimeoutError("timeout connecting to server")


class _MustNotCallRedis:
    async def get(self, *_args, **_kwargs):
        raise AssertionError("redis get should not be called in fallback mode")


def _ctx():
    return SimpleNamespace(metrics=_DummyMetrics())


def test_monitor_channel_returns_unhealthy_on_redis_timeout(monkeypatch):
    monkeypatch.setattr(monitor_channel, "is_mode_fallback_redis", lambda: False)
    monkeypatch.setattr(monitor_channel, "redis_client", _FailingRedis())

    result = asyncio.run(
        monitor_channel.run(
            _ctx(),
            {"channel": "telegram", "account_id": "bot_a01"},
        )
    )

    assert result.get("success") is not False
    assert result["status"] == "unhealthy"
    assert result["heartbeat_status"] == "unknown"
    assert result["channel"] == "telegram"
    assert result["account_id"] == "bot_a01"


def test_monitor_channel_uses_fallback_without_touching_redis(monkeypatch):
    monkeypatch.setattr(monitor_channel, "is_mode_fallback_redis", lambda: True)
    monkeypatch.setattr(monitor_channel, "redis_client", _MustNotCallRedis())

    result = asyncio.run(
        monitor_channel.run(
            _ctx(),
            {"channel": "whatsapp", "account_id": "default"},
        )
    )

    assert result.get("success") is not False
    assert result["status"] == "unhealthy"
    assert result["heartbeat_status"] == "fallback"
    assert result["channel"] == "whatsapp"
    assert result["account_id"] == "default"
