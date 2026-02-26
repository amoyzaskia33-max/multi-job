from typing import Dict, Any, Optional
from .base import Tool
from app.core.branches import update_branch_metrics
from app.core.queue import append_event

class RevenueTool(Tool):
    @property
    def name(self) -> str:
        return "revenue"
    
    @property
    def version(self) -> str:
        return "1.0.0"
    
    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        amount = float(input_data.get("amount") or 0)
        customer = input_data.get("customer", "anonymous")
        branch_id = getattr(ctx, "branch_id", "default")
        
        if amount <= 0:
            return {"success": False, "error": "Invalid amount"}

        try:
            # 1. Update Branch Metrics (Real-time dashboard update)
            await update_branch_metrics(branch_id, {
                "revenue": amount,
                "closings": 1
            })
            
            # 2. Record Audit Event
            await append_event("revenue.closing_recorded", {
                "amount": amount,
                "customer": customer,
                "branch_id": branch_id,
                "run_id": getattr(ctx, "run_id", "manual")
            })
            
            # 3. Notify Chairman (Proactive CEO)
            from app.core.boardroom import notify_chairman
            await notify_chairman(f"CLOSING SUKSES! Cabang {branch_id} baru saja mencatat pendapatan Rp {amount:,.0f} dari customer {customer}.", role="CEO")

            return {
                "success": True,
                "amount": amount,
                "branch_id": branch_id,
                "message": f"Revenue of {amount} successfully recorded for branch {branch_id}"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
