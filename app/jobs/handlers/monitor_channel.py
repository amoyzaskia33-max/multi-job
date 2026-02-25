from typing import Dict, Any

from redis.exceptions import RedisError, TimeoutError as RedisTimeoutError

from app.core.observability import logger
from app.core.queue import is_mode_fallback_redis
from app.core.redis_client import redis_client


def _payload_unhealthy(kanal: str, id_akun: str, heartbeat_status: str = "unknown") -> Dict[str, Any]:
    return {
        "status": "unhealthy",
        "channel": kanal,
        "account_id": id_akun,
        "heartbeat_status": heartbeat_status,
    }


async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Monitor channel health and metrics"""
    kanal = inputs.get("channel")
    id_akun = inputs.get("account_id")

    if not kanal or not id_akun:
        return {"success": False, "error": "channel and account_id are required"}

    # Simulate monitoring logic
    if is_mode_fallback_redis():
        logger.warning(
            "Channel heartbeat unavailable in fallback mode",
            extra={"channel": kanal, "account_id": id_akun},
        )
        return _payload_unhealthy(kanal, id_akun, heartbeat_status="fallback")

    try:
        # Check connector heartbeat
        kunci_heartbeat = f"hb:connector:{kanal}:{id_akun}"
        status = await redis_client.get(kunci_heartbeat)
    except (RedisTimeoutError, RedisError) as exc:
        logger.warning(
            f"Channel heartbeat lookup failed: {exc}",
            extra={"channel": kanal, "account_id": id_akun},
        )
        return _payload_unhealthy(kanal, id_akun, heartbeat_status="unknown")
    except Exception as e:
        logger.error(f"Channel monitoring failed: {e}", extra={"channel": kanal, "account_id": id_akun})
        return {"success": False, "error": str(e)}

    try:
        # Emit metrics
        ctx.metrics.increment("connector_up", tags={"channel": kanal, "account": id_akun})
    except Exception as exc:
        logger.warning(
            f"Failed to emit monitoring metric: {exc}",
            extra={"channel": kanal, "account_id": id_akun},
        )

    try:
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
    except Exception as exc:
        logger.warning(
            f"Failed to emit reconnect metric: {exc}",
            extra={"channel": kanal, "account_id": id_akun},
        )
        return {
            "status": "healthy",
            "channel": kanal,
            "account_id": id_akun,
            "heartbeat_status": status,
        }

    logger.warning("Channel heartbeat missing", extra={"channel": kanal, "account_id": id_akun})
    return _payload_unhealthy(kanal, id_akun, heartbeat_status=str(status) if status else "missing")
