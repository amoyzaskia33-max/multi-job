from typing import Dict, Any, Optional
import json
from .base import Tool
from app.core.redis_client import redis_client

class MessagingTool(Tool):
    @property
    def name(self) -> str:
        return "messaging"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        channel = input_data.get("channel") # facebook, instagram, whatsapp
        text = input_data.get("text")
        to_id = input_data.get("to_id")
        account_id = input_data.get("account_id") # Optional specific account
        branch_id = getattr(ctx, "branch_id", "default")

        if not channel or not text or not to_id:
            return {"success": False, "error": "channel, text, and to_id are required"}

        # 1. Account Awareness: Get available account from Armory if not specified
        from app.core.armory import list_all_accounts, lock_account, unlock_account
        
        target_account = None
        if account_id:
            from app.core.armory import get_account
            target_account = await get_account(account_id, include_password=True)
        else:
            # Find a READY account for this platform in this branch
            available = await list_all_accounts(platform=channel)
            ready_accounts = [a for b in available if (a := b) and b.get("branch_id") == branch_id and b.get("status") == "ready"]
            if ready_accounts:
                target_account = ready_accounts[0]

        if not target_account:
            return {"success": False, "error": f"No READY {channel} account available in Armory for branch {branch_id}"}

        # 2. Lock the account to prevent collisions
        acc_id = target_account["account_id"]
        locked = await lock_account(acc_id)
        if not locked:
            return {"success": False, "error": f"Account {acc_id} is currently busy."}

        try:
            # 3. Simulate Stealth Messaging (The "Hands")
            # In a real VPS setup, this would trigger the Ghost Browser (Playwright)
            import asyncio
            await asyncio.sleep(2) # Simulate human typing/navigation
            
            # Record the event
            from app.core.queue import append_event
            await append_event("messaging.message_sent", {
                "account_id": acc_id,
                "platform": channel,
                "to": to_id,
                "branch_id": branch_id
            })

            return {
                "success": True,
                "used_account": target_account["username"],
                "message": f"Message sent via {channel} (Account: {target_account['username']})",
                "sent_text": text
            }
        finally:
            # 4. Always unlock the account
            await unlock_account(acc_id)