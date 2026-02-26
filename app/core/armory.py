import json
import uuid
import os
import base64
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from redis.exceptions import RedisError
from .redis_client import redis_client
from .models import Account, AccountStatus

# Secret key for account encryption
# In production, this should be a strong key from env var
ARMORY_SECRET = os.getenv("ARMORY_MASTER_KEY", "spio-holding-super-secret-key-32ch")

ACCOUNTS_PREFIX = "armory:account:"
ACCOUNT_LIST = "armory:all"

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

def _encrypt(text: str) -> str:
    # Simple XOR or Base64 for now, can be replaced with Fernet/AES
    # To keep it lightweight without new heavy deps
    return base64.b64encode(text.encode()).decode()

def _decrypt(encrypted: str) -> str:
    return base64.b64decode(encrypted.encode()).decode()

async def add_account(platform: str, username: str, password: str, proxy: str = None, two_factor: str = None) -> Dict[str, Any]:
    account_id = f"acc_{uuid.uuid4().hex[:8]}"
    now = _now_iso()
    
    # Generate random fingerprint data to mimic human device
    import random
    fingerprint = {
        "user_agent": f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{random.randint(110, 122)}.0.0.0 Safari/537.36",
        "screen_res": random.choice(["1920x1080", "1366x768", "1440x900"]),
        "webgl_vendor": "Google Inc. (Intel)",
        "hardware_concurrency": random.choice([4, 8, 12])
    }

    account_data = {
        "account_id": account_id,
        "platform": platform.lower(),
        "username": username,
        "password_encrypted": _encrypt(password),
        "proxy": proxy,
        "two_factor_key": two_factor,
        "status": AccountStatus.PENDING,
        "fingerprint_data": fingerprint,
        "created_at": now,
        "updated_at": now,
        "metadata": {}
    }
    
    await redis_client.set(f"{ACCOUNTS_PREFIX}{account_id}", json.dumps(account_data))
    await redis_client.sadd(ACCOUNT_LIST, account_id)
    
    # Trigger Stealth Onboarding (via event)
    from .queue import append_event
    await append_event("armory.account_added", {"account_id": account_id, "platform": platform, "username": username})
    
    return account_data

async def get_account(account_id: str, include_password: bool = False) -> Optional[Dict[str, Any]]:
    data = await redis_client.get(f"{ACCOUNTS_PREFIX}{account_id}")
    if not data: return None
    
    acc = json.loads(data)
    if not include_password:
        acc.pop("password_encrypted", None)
        acc.pop("cookies_json", None)
    return acc

async def list_all_accounts(platform: str = None) -> List[Dict[str, Any]]:
    ids = await redis_client.smembers(ACCOUNT_LIST)
    results = []
    for aid in ids:
        acc = await get_account(aid)
        if acc:
            if platform and acc["platform"] != platform.lower():
                continue
            results.append(acc)
    return results

async def update_account_status(account_id: str, status: AccountStatus, note: str = None):
    data = await redis_client.get(f"{ACCOUNTS_PREFIX}{account_id}")
    if not data: return
    
    acc = json.loads(data)
    acc["status"] = status
    acc["updated_at"] = _now_iso()
    if note:
        acc["metadata"]["last_note"] = note
        
    await redis_client.set(f"{ACCOUNTS_PREFIX}{account_id}", json.dumps(acc))

async def deploy_account_to_branch(account_id: str, branch_id: str):
    data = await redis_client.get(f"{ACCOUNTS_PREFIX}{account_id}")
    if not data: return
    
    acc = json.loads(data)
    acc["branch_id"] = branch_id
    acc["updated_at"] = _now_iso()
    await redis_client.set(f"{ACCOUNTS_PREFIX}{account_id}", json.dumps(acc))

async def verify_account_stealth(account_id: str):
    """
    The core of Stealth Onboarding.
    Uses Playwright to simulate a human login and extract session data.
    """
    acc = await get_account(account_id, include_password=True)
    if not acc: return
    
    await update_account_status(account_id, AccountStatus.VERIFYING, "Starting stealth verification...")
    
    # In a real implementation, this would spawn a Playwright process.
    # For now, we simulate the process with a small delay.
    import asyncio
    await asyncio.sleep(5) 
    
    # Logic simulation:
    success = True # Assume success for now
    if success:
        # Save session data (cookies)
        data = await redis_client.get(f"{ACCOUNTS_PREFIX}{account_id}")
        acc_full = json.loads(data)
        acc_full["status"] = AccountStatus.READY
        acc_full["cookies_json"] = _encrypt('{"session_id": "fake_session_123"}')
        acc_full["last_active"] = _now_iso()
        await redis_client.set(f"{ACCOUNTS_PREFIX}{account_id}", json.dumps(acc_full))
    else:
        await update_account_status(account_id, AccountStatus.ACTION_REQUIRED, "Login failed. Manual verification needed.")
