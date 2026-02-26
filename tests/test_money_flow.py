import pytest
import asyncio
import uuid
from app.core.branches import create_branch, get_branch, upsert_blueprint
from app.core.armory import add_account, update_account_status
from app.core.models import AccountStatus

class _Ctx:
    def __init__(self, tools, branch_id, run_id="run_money_test"):
        self.tools = tools
        self.branch_id = branch_id
        self.run_id = run_id

@pytest.mark.anyio
async def test_full_money_making_flow(anyio_backend):
    if anyio_backend != "asyncio": return

    # 1. Setup Blueprint & Branch
    bp_id = "bp_test_money"
    await upsert_blueprint({
        "blueprint_id": bp_id,
        "name": "Money Test Unit",
        "description": "Testing the flow",
        "base_strategy": "test",
        "default_jobs": []
    })
    branch = await create_branch("Test Branch", bp_id)
    branch_id = branch["branch_id"]

    # 2. Setup Account in Armory
    acc = await add_account("instagram", "test_seller", "pass", "1.2.3.4")
    await update_account_status(acc["account_id"], AccountStatus.READY)
    from app.core.armory import deploy_account_to_branch
    await deploy_account_to_branch(acc["account_id"], branch_id)

    # 3. Setup Tools
    from app.core.tools.messaging import MessagingTool
    from app.core.tools.revenue import RevenueTool
    tools = {
        "messaging": MessagingTool().run,
        "revenue": RevenueTool().run
    }
    ctx = _Ctx(tools, branch_id)

    # 4. Simulate a SUCCESSFUL SALE (Closing)
    result = await tools["revenue"]({"amount": 1000000, "customer": "Chairman Test"}, ctx)
    assert result["success"] is True

    # 5. Verify Branch Metrics are updated
    updated_branch = await get_branch(branch_id)
    assert updated_branch["current_metrics"]["revenue"] == 1000000
    assert updated_branch["current_metrics"]["closings"] == 1

    # 6. Cleanup
    from app.core.redis_client import redis_client
    if hasattr(redis_client, 'connection_pool'):
        await redis_client.connection_pool.disconnect()

@pytest.fixture
def anyio_backend():
    return 'asyncio'
