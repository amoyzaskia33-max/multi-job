from typing import Dict, Any
from app.core.observability import logger
from app.core.redis_client import redis_client

async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Monitor channel health and metrics"""
    kanal = inputs.get("channel")
    id_akun = inputs.get("account_id")

    if not kanal or not id_akun:
        return {"success": False, "error": "channel and account_id are required"}

    # Simulate monitoring logic
    try:
        # Check connector heartbeat
        kunci_heartbeat = f"hb:connector:{kanal}:{id_akun}"
        status = await redis_client.get(kunci_heartbeat)

        # Emit metrics
        ctx.metrics.increment("connector_up", tags={"channel": kanal, "account": id_akun})

        if status == "connected":
            # Update metrics
            ctx.metrics.increment("connector_reconnect_total", tags={"channel": kanal, "account": id_akun})

            # Log success
            logger.info(
                "Channel monitoring successful",
                extra={"channel": kanal, "account_id": id_akun, "status": status},
            )

            return {
                "status": "healthy",
                "channel": kanal,
                "account_id": id_akun,
                "heartbeat_status": status,
            }
        else:
            logger.warning("Channel heartbeat missing", extra={"channel": kanal, "account_id": id_akun})
            return {
                "status": "unhealthy",
                "channel": kanal,
                "account_id": id_akun,
                "heartbeat_status": status,
            }

    except Exception as e:
        logger.error(f"Channel monitoring failed: {e}", extra={"channel": kanal, "account_id": id_akun})
        return {"success": False, "error": str(e)}
