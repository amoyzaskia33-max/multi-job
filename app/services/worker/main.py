import asyncio
import time
import uuid
from datetime import datetime, timezone

from app.core.handlers_registry import get_handler
from app.core.observability import logger, metrics_collector
from app.core.queue import append_event, dequeue_job, get_job_spec, init_queue
from app.core.redis_client import redis_client
from app.core.registry import policy_manager, tool_registry
from app.core.runner import handle_retry, process_job_event
from app.core.tools.files import FilesTool
from app.core.tools.http import HTTPTool
from app.core.tools.kv import KVTool
from app.core.tools.messaging import MessagingTool
from app.core.tools.metrics import MetricsTool

AGENT_HEARTBEAT_TTL = 30

# Initialize tools
tool_registry.register_tool("http", "1.0.0", HTTPTool().run)
tool_registry.register_tool("kv", "1.0.0", KVTool().run)
tool_registry.register_tool("messaging", "1.0.0", MessagingTool().run)
tool_registry.register_tool("files", "1.0.0", FilesTool().run)
tool_registry.register_tool("metrics", "1.0.0", MetricsTool().run)

# Set default policies
policy_manager.set_allowlist("monitor.channel", ["metrics", "messaging"])
policy_manager.set_allowlist("report.daily", ["metrics", "messaging"])
policy_manager.set_allowlist("backup.export", ["files", "kv"])
policy_manager.set_allowlist("agent.workflow", ["http", "kv", "messaging", "files", "metrics"])


async def update_heartbeat(worker_id: str):
    try:
        await redis_client.setex(
            f"hb:agent:worker:{worker_id}",
            AGENT_HEARTBEAT_TTL,
            datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        # In local fallback mode Redis may be unavailable; keep worker running.
        return


async def worker_main():
    """Main worker loop."""
    await init_queue()

    worker_id = f"worker_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    logger.info("Worker started", extra={"worker_id": worker_id})
    await append_event("system.worker_started", {"worker_id": worker_id})

    while True:
        try:
            await update_heartbeat(worker_id)
            job_data = await dequeue_job(worker_id)
            if not job_data:
                continue

            event_data = job_data["data"]
            job_type = event_data.get("type")
            handler = get_handler(job_type)
            if not handler:
                logger.error(
                    f"No handler found for job type: {job_type}",
                    extra={"run_id": event_data.get("run_id"), "job_id": event_data.get("job_id")},
                )
                await append_event(
                    "run.failed",
                    {
                        "run_id": event_data.get("run_id"),
                        "job_id": event_data.get("job_id"),
                        "job_type": job_type,
                        "error": f"No handler for {job_type}",
                    },
                )
                continue

            success = await process_job_event(
                event_data,
                worker_id,
                {job_type: handler},
                tool_registry.tools,
                logger,
                metrics_collector,
            )
            if success:
                continue

            # If failed, schedule retry when possible.
            job_id = event_data.get("job_id")
            run_id = event_data.get("run_id")
            attempt = int(event_data.get("attempt", 0))
            spec = await get_job_spec(job_id) if job_id else None
            if not spec:
                continue

            retry_policy = spec.get("retry_policy", {"max_retry": 0, "backoff_sec": [1, 2, 5]})
            await handle_retry(
                job_id=job_id,
                run_id=run_id,
                attempt=attempt,
                retry_policy=retry_policy,
                scheduled_at=datetime.now(timezone.utc),
            )

        except asyncio.CancelledError:
            logger.info("Worker cancelled", extra={"worker_id": worker_id})
            raise
        except Exception as e:
            logger.error(f"Worker error: {e}", extra={"worker_id": worker_id})
            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(worker_main())
