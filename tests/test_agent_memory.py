import asyncio

from redis.exceptions import RedisError

from app.core import agent_memory


def test_delete_agent_memory_removes_fallback_and_redis(monkeypatch):
    async def fake_delete(key: str):
        return 1

    async def fake_srem(set_name: str, value: str):
        return 1

    monkeypatch.setattr(agent_memory.redis_client, "delete", fake_delete)
    monkeypatch.setattr(agent_memory.redis_client, "srem", fake_srem)

    agent_memory._fallback_agent_memory.clear()
    agent_memory._fallback_agent_memory["tim-wa"] = {"agent_key": "tim-wa", "total_runs": 3}

    deleted = asyncio.run(agent_memory.delete_agent_memory("tim-wa"))
    assert deleted is True
    assert "tim-wa" not in agent_memory._fallback_agent_memory


def test_delete_agent_memory_works_when_redis_error(monkeypatch):
    async def fake_delete_raise(key: str):
        raise RedisError("redis down")

    async def fake_srem_raise(set_name: str, value: str):
        raise RedisError("redis down")

    monkeypatch.setattr(agent_memory.redis_client, "delete", fake_delete_raise)
    monkeypatch.setattr(agent_memory.redis_client, "srem", fake_srem_raise)

    agent_memory._fallback_agent_memory.clear()
    agent_memory._fallback_agent_memory["tim-riset"] = {"agent_key": "tim-riset", "total_runs": 1}

    deleted = asyncio.run(agent_memory.delete_agent_memory("tim-riset"))
    assert deleted is True
    assert "tim-riset" not in agent_memory._fallback_agent_memory
