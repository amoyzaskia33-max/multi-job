import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from .redis_client import redis_client

CHAT_HISTORY_KEY = "boardroom:chat:history"
MAX_HISTORY = 50

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

async def send_message_to_ceo(text: str, sender: str = "Chairman") -> Dict[str, Any]:
    msg_id = f"msg_{uuid.uuid4().hex[:6]}"
    payload = {
        "id": msg_id,
        "sender": sender,
        "text": text,
        "timestamp": _now_iso()
    }
    
    # Store in history
    await redis_client.lpush(CHAT_HISTORY_KEY, json.dumps(payload))
    await redis_client.ltrim(CHAT_HISTORY_KEY, 0, MAX_HISTORY - 1)
    
    return payload

async def get_chat_history(limit: int = 20) -> List[Dict[str, Any]]:
    raw_msgs = await redis_client.lrange(CHAT_HISTORY_KEY, 0, limit - 1)
    msgs = [json.loads(m) for m in raw_msgs]
    msgs.reverse() # Show oldest to newest
    return msgs

async def process_chairman_mandate(text: str):
    """
    Core logic for CEO to understand Chairman's natural language mandates.
    """
    # 1. Record the message
    await send_message_to_ceo(text, sender="Chairman")
    
    # 2. Trigger CEO thinking loop (via worker event)
    from .queue import append_event
    await append_event("ceo.mandate_received", {"text": text})
    
    return {"status": "received", "message": "CEO is analyzing your mandate..."}

async def notify_chairman(text: str, role: str = "CEO"):
    """
    Allows the CEO or system to proactively post a message to the Boardroom.
    Includes smart suggestions if problems are detected.
    """
    # Self-healing logic: Add a helpful suggestion if NO AMMO is detected
    suggestion = ""
    if "NO AMMO" in text.upper() or "account" in text.lower():
        suggestion = "\n\nSaran CEO: Segera input akun baru di menu 'The Armory' atau pindahkan akun dari unit bisnis yang sedang idle."
    
    final_text = f"{text}{suggestion}"
    await send_message_to_ceo(final_text, sender=role)
    
    # Also trigger external notification (Telegram)
    from app.jobs.handlers.agent_workflow import _kirim_notifikasi_eksternal
    import uuid
    await _kirim_notifikasi_eksternal(
        title="Proactive CEO Update", 
        impact="Actionable Insight", 
        approval_id=f"auto_{uuid.uuid4().hex[:4]}",
        role=role
    )
