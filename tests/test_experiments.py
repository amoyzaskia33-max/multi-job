import asyncio

import pytest
from redis.exceptions import RedisError

from app.core import experiments


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
    experiments._fallback_experiments.clear()


def test_upsert_and_get_experiment_in_fallback(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(experiments, "redis_client", _FailingRedis())

    created = asyncio.run(
        experiments.upsert_experiment(
            "landing_ab_1",
            {
                "name": "Landing Header Test",
                "job_id": "job_marketing_01",
                "variant_a_prompt": "Gunakan header versi sederhana.",
                "variant_b_prompt": "Gunakan header versi urgency + CTA kuat.",
                "traffic_split_b": 35,
                "tags": ["growth", "wa", "growth"],
                "enabled": True,
            },
        )
    )

    assert created["experiment_id"] == "landing_ab_1"
    assert created["name"] == "Landing Header Test"
    assert created["traffic_split_b"] == 35
    assert created["enabled"] is True
    assert created["tags"] == ["growth", "wa"]

    loaded = asyncio.run(experiments.get_experiment("landing_ab_1"))
    assert loaded is not None
    assert loaded["job_id"] == "job_marketing_01"
    assert loaded["variant_b_prompt"].startswith("Gunakan header versi urgency")


def test_list_experiments_supports_enabled_filter_and_search(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(experiments, "redis_client", _FailingRedis())

    asyncio.run(
        experiments.upsert_experiment(
            "exp_alpha",
            {
                "name": "Eksperimen Alpha",
                "job_id": "job_alpha",
                "variant_a_prompt": "A1",
                "variant_b_prompt": "B1",
                "enabled": True,
            },
        )
    )
    asyncio.run(
        experiments.upsert_experiment(
            "exp_beta",
            {
                "name": "Eksperimen Beta",
                "job_id": "job_beta",
                "variant_a_prompt": "A2",
                "variant_b_prompt": "B2",
                "enabled": False,
                "tags": ["checkout"],
            },
        )
    )

    semua = asyncio.run(experiments.list_experiments())
    aktif = asyncio.run(experiments.list_experiments(enabled=True))
    cari_tag = asyncio.run(experiments.list_experiments(search="checkout"))

    assert len(semua) == 2
    assert len(aktif) == 1
    assert aktif[0]["experiment_id"] == "exp_alpha"
    assert len(cari_tag) == 1
    assert cari_tag[0]["experiment_id"] == "exp_beta"


def test_set_enabled_and_delete_experiment(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(experiments, "redis_client", _FailingRedis())

    asyncio.run(
        experiments.upsert_experiment(
            "exp_toggle",
            {
                "name": "Eksperimen Toggle",
                "variant_a_prompt": "A",
                "variant_b_prompt": "B",
                "enabled": False,
            },
        )
    )

    toggled = asyncio.run(experiments.set_experiment_enabled("exp_toggle", True))
    assert toggled is not None
    assert toggled["enabled"] is True

    removed = asyncio.run(experiments.delete_experiment("exp_toggle"))
    assert removed is True
    assert asyncio.run(experiments.get_experiment("exp_toggle")) is None


def test_upsert_experiment_validates_required_fields(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(experiments, "redis_client", _FailingRedis())

    with pytest.raises(ValueError):
        asyncio.run(
            experiments.upsert_experiment(
                "exp_invalid",
                {
                    "name": "",
                    "variant_a_prompt": "A",
                    "variant_b_prompt": "B",
                },
            )
        )


def test_record_experiment_variant_run_updates_metadata(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(experiments, "redis_client", _FailingRedis())

    asyncio.run(
        experiments.upsert_experiment(
            "exp_variant",
            {
                "name": "Eksperimen Variant",
                "job_id": "job_variant",
                "variant_a_prompt": "A",
                "variant_b_prompt": "B",
                "enabled": True,
            },
        )
    )

    asyncio.run(
        experiments.record_experiment_variant_run(
            "exp_variant",
            variant="b",
            variant_name="treatment",
            job_id="job_variant",
            run_id="run_var_1",
            bucket=37,
        )
    )

    updated = asyncio.run(experiments.get_experiment("exp_variant"))
    assert updated["last_variant"] == "b"
    assert updated["last_variant_name"] == "treatment"
    assert updated["last_variant_bucket"] == 37
    assert updated["last_variant_run_at"] is not None

    with pytest.raises(ValueError):
        asyncio.run(
            experiments.upsert_experiment(
                "exp_invalid_prompt",
                {
                    "name": "Eksperimen Tanpa Prompt",
                    "variant_a_prompt": " ",
                    "variant_b_prompt": " ",
                },
            )
        )

    with pytest.raises(ValueError):
        asyncio.run(
            experiments.upsert_experiment(
                "exp tidak valid",
                {
                    "name": "ID Salah",
                    "variant_a_prompt": "A",
                    "variant_b_prompt": "B",
                },
            )
        )


def test_resolve_experiment_prompt_for_job_applies_enabled_experiment(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(experiments, "redis_client", _FailingRedis())

    asyncio.run(
        experiments.upsert_experiment(
            "exp_prompt",
            {
                "name": "Eksperimen Prompt",
                "job_id": "job_growth",
                "variant_a_prompt": "Prompt A",
                "variant_b_prompt": "Prompt B",
                "traffic_split_b": 100,
                "enabled": True,
            },
        )
    )

    resolved = asyncio.run(
        experiments.resolve_experiment_prompt_for_job(
            "job_growth",
            run_id="run_001",
            base_prompt="Prompt Dasar",
        )
    )

    assert resolved["applied"] is True
    assert resolved["experiment_id"] == "exp_prompt"
    assert resolved["variant"] == "b"
    assert resolved["prompt"] == "Prompt B"
    assert resolved["reason"] == "traffic_split"


def test_resolve_experiment_prompt_for_job_forced_variant_fallback(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(experiments, "redis_client", _FailingRedis())

    asyncio.run(
        experiments.upsert_experiment(
            "exp_force",
            {
                "name": "Eksperimen Force",
                "job_id": "job_force",
                "variant_a_prompt": "Prompt A",
                "variant_b_prompt": "",
                "enabled": True,
            },
        )
    )

    resolved = asyncio.run(
        experiments.resolve_experiment_prompt_for_job(
            "job_force",
            run_id="run_002",
            base_prompt="Prompt Dasar",
            experiment_id="exp_force",
            preferred_variant="b",
        )
    )

    assert resolved["applied"] is True
    assert resolved["variant"] == "a"
    assert resolved["prompt"] == "Prompt A"
    assert resolved["reason"] == "forced_variant_prompt_fallback"


def test_resolve_experiment_prompt_for_job_returns_base_prompt_when_no_match(monkeypatch):
    _reset_fallback_store()
    monkeypatch.setattr(experiments, "redis_client", _FailingRedis())

    resolved = asyncio.run(
        experiments.resolve_experiment_prompt_for_job(
            "job_not_found",
            run_id="run_003",
            base_prompt="Prompt Cadangan",
        )
    )

    assert resolved["applied"] is False
    assert resolved["prompt"] == "Prompt Cadangan"
    assert resolved["reason"] == "no_matching_experiment"
