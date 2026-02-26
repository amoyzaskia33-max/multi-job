import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from redis.exceptions import RedisError
from .redis_client import redis_client
from .models import Branch, BranchBlueprint, Squad

BRANCH_PREFIX = "branch:item:"
BLUEPRINT_PREFIX = "branch:blueprint:"
BRANCH_LIST = "branch:all"

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

async def upsert_blueprint(blueprint: Dict[str, Any]):
    bid = blueprint["blueprint_id"]
    await redis_client.set(f"{BLUEPRINT_PREFIX}{bid}", json.dumps(blueprint))
    return blueprint

async def get_blueprint(blueprint_id: str) -> Optional[Dict[str, Any]]:
    data = await redis_client.get(f"{BLUEPRINT_PREFIX}{blueprint_id}")
    return json.loads(data) if data else None

async def create_branch(name: str, blueprint_id: str, kpi: Dict[str, Any] = None) -> Dict[str, Any]:
    blueprint = await get_blueprint(blueprint_id)
    if not blueprint:
        raise ValueError(f"Blueprint {blueprint_id} not found")
    
    branch_id = f"br_{uuid.uuid4().hex[:8]}"
    now = _now_iso()
    
    branch_data = {
        "branch_id": branch_id,
        "name": name,
        "status": "active",
        "blueprint_id": blueprint_id,
        "target_kpi": kpi or {"revenue_target": 0},
        "current_metrics": {"revenue": 0, "leads": 0, "closings": 0},
        "squad": {}, # Will be filled during auto-provisioning
        "created_at": now,
        "updated_at": now,
        "metadata": {"strategy": blueprint.get("base_strategy", "")}
    }
    
    await redis_client.set(f"{BRANCH_PREFIX}{branch_id}", json.dumps(branch_data))
    await redis_client.sadd(BRANCH_LIST, branch_id)
    return branch_data

async def get_branch(branch_id: str) -> Optional[Dict[str, Any]]:
    data = await redis_client.get(f"{BRANCH_PREFIX}{branch_id}")
    return json.loads(data) if data else None

async def list_branches() -> List[Dict[str, Any]]:
    ids = await redis_client.smembers(BRANCH_LIST)
    branches = []
    for bid in ids:
        data = await get_branch(bid)
        if data:
            branches.append(data)
    return branches

async def update_branch_metrics(branch_id: str, metrics_delta: Dict[str, Any]):
    branch = await get_branch(branch_id)
    if not branch: return
    
    for k, v in metrics_delta.items():
        if k in branch["current_metrics"]:
            branch["current_metrics"][k] += v
            
    branch["updated_at"] = _now_iso()
    await redis_client.set(f"{BRANCH_PREFIX}{branch_id}", json.dumps(branch))
