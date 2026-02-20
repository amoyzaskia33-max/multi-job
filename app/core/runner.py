import asyncio
import time
import traceback
from datetime import datetime, timezone
from typing import Any, Callable, Dict

from .models import RunStatus, Run, RunResult
from .queue import add_run_to_job_history, append_event, get_run, save_run
from .redis_client import redis_client


class JobContext:
    def __init__(
        self,
        job_id: str,
        run_id: str,
        trace_id: str,
        redis_client,
        tools,
        logger,
        metrics,
        span,
        timeout_ms: int,
    ):
        self.job_id = job_id
        self.run_id = run_id
        self.trace_id = trace_id
        self.redis = redis_client
        self.tools = tools
        self.logger = logger
        self.metrics = metrics
        self.span = span
        self.timeout_ms = timeout_ms


async def execute_job_handler(handler: Callable, ctx: JobContext, inputs: Dict) -> RunResult:
    """Execute a job handler with timeout and error handling"""
    start_time = time.time()

    try:
        result = await asyncio.wait_for(handler(ctx, inputs), timeout=ctx.timeout_ms / 1000.0)
        duration_ms = int((time.time() - start_time) * 1000)

        # Convention: handlers may return {"success": false, "error": "..."} to signal logical failure.
        # Treat this as a failed run so status, retries, and observability stay consistent.
        if isinstance(result, dict) and result.get("success") is False:
            error_msg = str(result.get("error") or "Handler returned success=false")
            ctx.logger.warning(
                "Handler returned logical failure",
                extra={"job_id": ctx.job_id, "run_id": ctx.run_id, "error": error_msg},
            )
            return RunResult(success=False, output=result, error=error_msg, duration_ms=duration_ms)

        return RunResult(success=True, output=result, duration_ms=duration_ms)

    except asyncio.TimeoutError:
        error_msg = f"Job timed out after {ctx.timeout_ms}ms"
        ctx.logger.error(error_msg, extra={"job_id": ctx.job_id, "run_id": ctx.run_id})
        return RunResult(success=False, error=error_msg, duration_ms=int((time.time() - start_time) * 1000))

    except Exception as e:
        error_msg = f"Job failed with exception: {str(e)}\n{traceback.format_exc()}"
        ctx.logger.error(error_msg, extra={"job_id": ctx.job_id, "run_id": ctx.run_id})
        return RunResult(success=False, error=error_msg, duration_ms=int((time.time() - start_time) * 1000))

async def process_job_event(event_data: dict, worker_id: str, 
                           handler_registry: dict, 
                           tools: dict,
                           logger,
                           metrics) -> bool:
    """Process a single job event from the queue"""
    try:
        # Parse event data
        run_id = event_data["run_id"]
        job_id = event_data["job_id"]
        job_type = event_data["type"]
        inputs = event_data.get("inputs", {})
        attempt = event_data.get("attempt", 0)
        scheduled_at_str = event_data.get("scheduled_at")
        timeout_ms = int(event_data.get("timeout_ms", 30000))

        # Get current run status
        run = await get_run(run_id)
        if not run:
            run = Run(
                run_id=run_id,
                job_id=job_id,
                status=RunStatus.QUEUED,
                attempt=attempt,
                scheduled_at=datetime.fromisoformat(scheduled_at_str) if scheduled_at_str else datetime.now(timezone.utc),
                inputs=inputs,
                trace_id=event_data.get("trace_id")
            )
        elif not getattr(run, "inputs", None):
            run.inputs = inputs

        run.status = RunStatus.RUNNING
        run.started_at = datetime.now(timezone.utc)
        await save_run(run)
        await append_event(
            "run.started",
            {"run_id": run_id, "job_id": job_id, "job_type": job_type, "worker_id": worker_id, "attempt": attempt},
        )

        # Get handler for this job type
        handler = handler_registry.get(job_type)
        if not handler:
            error_msg = f"No handler registered for job type: {job_type}"
            logger.error(error_msg, extra={"job_id": job_id, "run_id": run_id})
            run.status = RunStatus.FAILED
            run.result = RunResult(success=False, error=error_msg)
            run.finished_at = datetime.now(timezone.utc)
            await save_run(run)
            await append_event(
                "run.failed",
                {"run_id": run_id, "job_id": job_id, "job_type": job_type, "error": error_msg, "attempt": attempt},
            )
            return False

        # Create context
        ctx = JobContext(
            job_id=job_id,
            run_id=run_id,
            trace_id=event_data.get("trace_id", ""),
            redis_client=redis_client,
            tools=tools,
            logger=logger,
            metrics=metrics,
            span=None,
            timeout_ms=timeout_ms,
        )

        # Execute handler
        result = await execute_job_handler(handler, ctx, inputs)

        # Update run status
        run.status = RunStatus.SUCCESS if result.success else RunStatus.FAILED
        run.finished_at = datetime.now(timezone.utc)
        run.result = result

        await save_run(run)
        await add_run_to_job_history(job_id, run_id)

        await append_event(
            "run.completed" if result.success else "run.failed",
            {
                "run_id": run_id,
                "job_id": job_id,
                "job_type": job_type,
                "attempt": attempt,
                "duration_ms": result.duration_ms,
                "error": result.error,
            },
        )

        # Emit metrics
        if metrics:
            status_label = run.status.value if hasattr(run.status, "value") else str(run.status)
            metrics.increment("job_runs_total", tags={"type": job_type, "status": status_label})
            if result.duration_ms:
                metrics.observe("job_duration_ms", result.duration_ms, tags={"type": job_type})

        return result.success

    except Exception as e:
        logger.error(f"Error processing job event: {e}", extra={
            "job_id": event_data.get("job_id"),
            "run_id": event_data.get("run_id"),
            "error": str(e)
        })
        return False

async def handle_retry(job_id: str, run_id: str, attempt: int, 
                       retry_policy: dict, scheduled_at: datetime):
    """Handle job retry logic"""
    max_retry = int(retry_policy.get("max_retry", 0))
    if attempt >= max_retry:
        return False  # No more retries

    # Calculate backoff delay
    backoff_sec = retry_policy.get("backoff_sec", [1, 2, 5])
    delay_sec = backoff_sec[min(attempt, len(backoff_sec) - 1)]

    # Schedule retry
    from .queue import schedule_delayed_job
    from .models import QueueEvent

    # Get current job spec
    from .queue import get_job_spec
    spec = await get_job_spec(job_id)
    if not spec:
        return False

    # Create new event for retry
    event = QueueEvent(
        run_id=run_id,
        job_id=job_id,
        type=spec["type"],
        inputs=spec.get("inputs", {}),
        attempt=attempt + 1,
        scheduled_at=scheduled_at.isoformat(),
        timeout_ms=int(spec.get("timeout_ms", 30000)),
    )

    await schedule_delayed_job(event, delay_sec)
    await append_event(
        "run.retry_scheduled",
        {"run_id": run_id, "job_id": job_id, "attempt": attempt + 1, "delay_sec": delay_sec},
    )
    return True
