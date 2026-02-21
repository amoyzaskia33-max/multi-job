import asyncio

from redis.exceptions import RedisError

from app.core import connector_accounts


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


def _reset_fallback_store():
    connector_accounts._fallback_accounts.clear()
    connector_accounts._fallback_last_update.clear()


def test_upsert_requires_bot_token_for_new_account(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(connector_accounts, "redis_client", _FailingRedis())

    try:
        asyncio.run(
            connector_accounts.upsert_telegram_account(
                "bot_a01",
                {"enabled": True},
            )
        )
        assert False, "Expected ValueError when bot_token is missing"
    except ValueError as exc:
        assert "bot_token" in str(exc)


def test_upsert_and_get_account_masks_token(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(connector_accounts, "redis_client", _FailingRedis())

    created = asyncio.run(
        connector_accounts.upsert_telegram_account(
            "bot_a01",
            {
                "bot_token": "123456789:ABCDEFGHIJKLMN",
                "allowed_chat_ids": ["123", " 456 ", "123"],
                "use_ai": True,
                "wait_seconds": 2,
                "timezone": "Asia/Jakarta",
            },
        )
    )

    assert created["account_id"] == "bot_a01"
    assert created["has_bot_token"] is True
    assert created["bot_token_masked"] is not None
    assert "bot_token" not in created
    assert created["allowed_chat_ids"] == ["123", "456"]

    public_row = asyncio.run(connector_accounts.get_telegram_account("bot_a01", include_secret=False))
    secret_row = asyncio.run(connector_accounts.get_telegram_account("bot_a01", include_secret=True))

    assert public_row is not None
    assert secret_row is not None
    assert "bot_token" not in public_row
    assert secret_row["bot_token"] == "123456789:ABCDEFGHIJKLMN"

    updated = asyncio.run(
        connector_accounts.upsert_telegram_account(
            "bot_a01",
            {
                "allowed_chat_ids": ["999"],
                "enabled": False,
            },
        )
    )

    assert updated["enabled"] is False
    assert updated["allowed_chat_ids"] == ["999"]

    listed = asyncio.run(connector_accounts.list_telegram_accounts(include_secret=False))
    assert len(listed) == 1
    assert listed[0]["account_id"] == "bot_a01"


def test_last_update_state_and_delete(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(connector_accounts, "redis_client", _FailingRedis())

    asyncio.run(
        connector_accounts.upsert_telegram_account(
            "bot_a01",
            {"bot_token": "token_value"},
        )
    )

    before = asyncio.run(connector_accounts.get_telegram_last_update_id("bot_a01"))
    assert before == 0

    asyncio.run(connector_accounts.set_telegram_last_update_id("bot_a01", 1234))
    after = asyncio.run(connector_accounts.get_telegram_last_update_id("bot_a01"))
    assert after == 1234

    removed = asyncio.run(connector_accounts.delete_telegram_account("bot_a01"))
    assert removed is True

    row = asyncio.run(connector_accounts.get_telegram_account("bot_a01", include_secret=False))
    assert row is None

    state_after_delete = asyncio.run(connector_accounts.get_telegram_last_update_id("bot_a01"))
    assert state_after_delete == 0
