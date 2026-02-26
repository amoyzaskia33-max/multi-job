import pytest
import uuid
from app.core.triggers import upsert_trigger, get_trigger, list_triggers, fire_trigger, delete_trigger
from app.core.queue import save_job_spec, enable_job

@pytest.fixture
def anyio_backend():
    return 'asyncio'

@pytest.mark.anyio
async def test_trigger_lifecycle():
    # Setup job target
    job_id = f"test-job-{uuid.uuid4().hex[:6]}"
    await save_job_spec(job_id, {
        "job_id": job_id,
        "type": "monitor.channel",
        "inputs": {"test": True}
    })
    await enable_job(job_id)

    trigger_id = f"test-trigger-{uuid.uuid4().hex[:6]}"
    
    # 1. Upsert
    payload = {
        "name": "Test Trigger",
        "job_id": job_id,
        "channel": "webhook",
        "description": "A test trigger",
        "enabled": True,
        "default_payload": {"foo": "bar"}
    }
    row = await upsert_trigger(trigger_id, payload)
    assert row["trigger_id"] == trigger_id
    assert row["name"] == "Test Trigger"
    assert row["channel"] == "webhook"

    # 2. Get
    fetched = await get_trigger(trigger_id)
    assert fetched is not None
    assert fetched["name"] == "Test Trigger"

    # 3. List
    all_triggers = await list_triggers()
    assert any(t["trigger_id"] == trigger_id for t in all_triggers)

    # 4. Fire
    result = await fire_trigger(trigger_id, payload={"extra": 123}, source="test.suite")
    assert "run_id" in result
    assert result["job_id"] == job_id
    assert result["channel"] == "webhook"

    # 5. Delete
    deleted = await delete_trigger(trigger_id)
    assert deleted is True
    assert await get_trigger(trigger_id) is None
