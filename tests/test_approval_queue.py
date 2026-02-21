import asyncio

import pytest
from redis.exceptions import RedisError

from app.core import approval_queue


def _paksa_mode_fallback(monkeypatch):
    async def _redis_error(*args, **kwargs):
        raise RedisError("forced fallback")

    for nama_metode in ("get", "set", "lpush", "ltrim", "lrange"):
        monkeypatch.setattr(approval_queue.redis_client, nama_metode, _redis_error)

    approval_queue._fallback_rows.clear()
    approval_queue._fallback_order.clear()
    approval_queue._fallback_run_index.clear()


def test_create_approval_request_deduplicates_by_run_id(monkeypatch):
    _paksa_mode_fallback(monkeypatch)

    payload = {
        "run_id": "run_123",
        "job_id": "job_agent_1",
        "job_type": "agent.workflow",
        "prompt": "cek trend tiktok",
        "summary": "butuh approval",
        "approval_requests": [{"kind": "provider_account", "provider": "tiktok_open", "account_id": "default"}],
        "available_providers": {"openai": ["default"]},
        "available_mcp_servers": ["mcp_fetch"],
    }

    pertama, dibuat_pertama = asyncio.run(approval_queue.create_approval_request(**payload))
    kedua, dibuat_kedua = asyncio.run(approval_queue.create_approval_request(**payload))

    assert dibuat_pertama is True
    assert dibuat_kedua is False
    assert pertama["approval_id"] == kedua["approval_id"]
    assert pertama["status"] == "pending"


def test_decide_and_filter_approval_requests(monkeypatch):
    _paksa_mode_fallback(monkeypatch)

    row_a, _ = asyncio.run(
        approval_queue.create_approval_request(
            run_id="run_a",
            job_id="job_a",
            job_type="agent.workflow",
            prompt="prompt a",
            summary="summary a",
            approval_requests=[{"kind": "mcp_server", "server_id": "mcp_tiktok_proxy"}],
        )
    )
    row_b, _ = asyncio.run(
        approval_queue.create_approval_request(
            run_id="run_b",
            job_id="job_b",
            job_type="agent.workflow",
            prompt="prompt b",
            summary="summary b",
            approval_requests=[{"kind": "provider_account", "provider": "openai"}],
        )
    )

    pending_awal = asyncio.run(approval_queue.list_approval_requests(status="pending"))
    assert {item["approval_id"] for item in pending_awal} == {row_a["approval_id"], row_b["approval_id"]}

    approved = asyncio.run(
        approval_queue.decide_approval_request(
            row_a["approval_id"],
            status="approved",
            decision_by="owner",
            decision_note="lanjut",
        )
    )

    assert approved is not None
    assert approved["status"] == "approved"
    assert approved["decision_by"] == "owner"
    assert approved["decision_note"] == "lanjut"

    pending_setelah = asyncio.run(approval_queue.list_approval_requests(status="pending"))
    approved_list = asyncio.run(approval_queue.list_approval_requests(status="approved"))

    assert {item["approval_id"] for item in pending_setelah} == {row_b["approval_id"]}
    assert {item["approval_id"] for item in approved_list} == {row_a["approval_id"]}


def test_invalid_status_raises_error(monkeypatch):
    _paksa_mode_fallback(monkeypatch)

    with pytest.raises(ValueError):
        asyncio.run(approval_queue.list_approval_requests(status="unknown"))
