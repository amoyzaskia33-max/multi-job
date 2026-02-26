import pytest
import asyncio
import uuid
from app.core.armory import add_account, get_account, list_all_accounts, update_account_status
from app.core.models import AccountStatus
from app.services.worker.main import _proses_satu_job

@pytest.mark.anyio
async def test_armory_stealth_onboarding_flow():
    # 1. Simulate Chairman adding an account
    username = f"warrior_{uuid.uuid4().hex[:4]}"
    acc = await add_account(
        platform="instagram",
        username=username,
        password="secret_password_123",
        proxy="1.2.3.4:8080"
    )
    
    account_id = acc["account_id"]
    assert acc["status"] == AccountStatus.PENDING
    
    # 2. Verify it's in the database
    fetched = await get_account(account_id)
    assert fetched["username"] == username
    
    # 3. Simulate Worker catching the event
    event = {
        "type": "armory.account_added",
        "data": {"account_id": account_id}
    }
    
    # We call the worker logic directly
    await _proses_satu_job("worker_test", event)
    
    # 4. Verify account is now READY
    final_acc = await get_account(account_id)
    assert final_acc["status"] == AccountStatus.READY
    assert final_acc["last_active"] is not None

@pytest.fixture
def anyio_backend():
    return 'asyncio'
