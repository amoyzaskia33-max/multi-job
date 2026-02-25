import asyncio
from typing import Dict, List, Set

import pytest
from redis.exceptions import RedisError

from app.core import skills


class _InMemoryRedis:
    def __init__(self):
        self._store: Dict[str, str] = {}
        self._sets: Dict[str, Set[str]] = {}

    async def get(self, key: str):
        return self._store.get(key)

    async def set(self, key: str, value: str):
        self._store[key] = value
        return True

    async def sadd(self, key: str, value: str):
        self._sets.setdefault(key, set()).add(value)
        return 1

    async def smembers(self, key: str):
        return list(self._sets.get(key, set()))

    async def delete(self, key: str):
        return 1 if self._store.pop(key, None) is not None else 0

    async def srem(self, key: str, value: str):
        if key in self._sets and value in self._sets[key]:
            self._sets[key].remove(value)
            return 1
        return 0


class _FailingRedis(_InMemoryRedis):
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


def test_upsert_and_list_skill(monkeypatch):
    memory_redis = _InMemoryRedis()
    monkeypatch.setattr(skills, "redis_client", memory_redis)

    async def run_case():
        row = await skills.upsert_skill(
            "skill_writer",
            {
                "name": "Writer Navigator",
                "job_type": "agent.workflow",
                "description": "Generate outlines for content teams.",
                "command_allow_prefixes": ["python scripts/generate"],
                "allowed_channels": ["telegram", "webhook"],
                "tags": ["content", "writing"],
            },
        )

        assert row["skill_id"] == "skill_writer"
        assert row["job_type"] == "agent.workflow"
        assert row["description"] == "Generate outlines for content teams."
        assert "default_inputs" in row

        daftar = await skills.list_skills()
        assert len(daftar) == 1
        assert daftar[0]["skill_id"] == "skill_writer"
        assert "telegram" in daftar[0]["allowed_channels"]

    asyncio.run(run_case())


def test_list_skill_fallback(monkeypatch):
    failing_redis = _FailingRedis()
    monkeypatch.setattr(skills, "redis_client", failing_redis)

    async def run_case():
        await skills.upsert_skill(
            "skill_writer",
            {
                "name": "Writer Navigator",
                "job_type": "agent.workflow",
                "description": "Generate outlines for content teams.",
            },
        )
        lista = await skills.list_skills()
        assert len(lista) == 1

    asyncio.run(run_case())


def test_delete_skill(monkeypatch):
    memory_redis = _InMemoryRedis()
    monkeypatch.setattr(skills, "redis_client", memory_redis)

    async def run_case():
        await skills.upsert_skill(
            "skill_writer",
            {
                "name": "Writer Navigator",
                "job_type": "agent.workflow",
            },
        )
        deleted = await skills.delete_skill("skill_writer")
        assert deleted
        assert await skills.get_skill("skill_writer") is None

    asyncio.run(run_case())
