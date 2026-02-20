import asyncio
import json
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from redis.exceptions import RedisError, TimeoutError as RedisTimeoutError

from app.core.models import JobSpec, QueueEvent, Run, RunStatus
from app.core.observability import expose_metrics, logger
from app.core.queue import (
    add_run_to_job_history,
    append_event,
    enable_job,
    disable_job,
    enqueue_job,
    get_events,
    get_job_run_ids,
    get_job_spec,
    get_queue_metrics,
    get_run,
    init_queue,
    is_job_enabled,
    list_enabled_job_ids,
    list_job_specs,
    list_runs,
    save_job_spec,
    save_run,
)
from app.core.scheduler import Scheduler
from app.core.redis_client import close_redis, redis_client
from app.services.api.planner import PlannerRequest, PlannerResponse, build_plan_from_prompt
from app.services.api.planner_ai import PlannerAiRequest, build_plan_with_ai
from app.services.worker.main import worker_main

app = FastAPI(
    title="Multi-Job Platform API",
    description="API for managing and monitoring jobs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RedisError)
@app.exception_handler(RedisTimeoutError)
async def redis_exception_handler(request: Request, exc: Exception):
    logger.warning("Redis request failed", extra={"path": request.url.path, "error": str(exc)})
    return JSONResponse(
        status_code=503,
        content={"detail": "Redis is unavailable. Service is running in degraded mode."},
    )


def _model_dump(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fallback_payload(endpoint: str, payload: Any) -> Any:
    logger.warning("Serving degraded fallback payload", extra={"endpoint": endpoint})
    return payload


async def _is_redis_ready() -> bool:
    try:
        await redis_client.ping()
        return True
    except Exception:
        return False


def _local_agents_snapshot() -> List[Dict[str, Any]]:
    now = _now_iso()
    rows: List[Dict[str, Any]] = []

    worker_task = getattr(app.state, "local_worker_task", None)
    scheduler_task = getattr(app.state, "local_scheduler_task", None)

    if worker_task:
        rows.append(
            {
                "id": "local-worker",
                "type": "worker",
                "status": "offline" if worker_task.done() else "online",
                "last_heartbeat": now,
                "last_heartbeat_at": now,
                "active_sessions": 1 if not worker_task.done() else 0,
                "version": "local-fallback",
            }
        )

    if scheduler_task:
        rows.append(
            {
                "id": "local-scheduler",
                "type": "scheduler",
                "status": "offline" if scheduler_task.done() else "online",
                "last_heartbeat": now,
                "last_heartbeat_at": now,
                "active_sessions": 1 if not scheduler_task.done() else 0,
                "version": "local-fallback",
            }
        )

    return rows


async def _start_local_runtime():
    if getattr(app.state, "local_mode", False):
        return

    scheduler = Scheduler()
    app.state.local_scheduler = scheduler
    app.state.local_worker_task = asyncio.create_task(worker_main(), name="local-worker")
    app.state.local_scheduler_task = asyncio.create_task(scheduler.start(), name="local-scheduler")
    app.state.local_mode = True

    await append_event(
        "system.local_mode_enabled",
        {"message": "Redis unavailable; local worker and scheduler enabled"},
    )


async def _stop_local_runtime():
    scheduler = getattr(app.state, "local_scheduler", None)
    if scheduler:
        with suppress(Exception):
            await scheduler.stop()

    for attr in ("local_worker_task", "local_scheduler_task"):
        task = getattr(app.state, attr, None)
        if task and not task.done():
            task.cancel()

    for attr in ("local_worker_task", "local_scheduler_task"):
        task = getattr(app.state, attr, None)
        if task:
            with suppress(asyncio.CancelledError, Exception):
                await task


@app.on_event("startup")
async def on_startup():
    app.state.local_mode = False
    app.state.local_scheduler = None
    app.state.local_worker_task = None
    app.state.local_scheduler_task = None

    await init_queue()
    redis_ready = await _is_redis_ready()
    app.state.redis_ready = redis_ready

    await append_event("system.api_started", {"message": "API service started", "redis_ready": redis_ready})
    if not redis_ready:
        await _start_local_runtime()


@app.on_event("shutdown")
async def on_shutdown():
    await _stop_local_runtime()
    await close_redis()


@app.get("/healthz")
async def healthz():
    return {"status": "healthy"}


@app.get("/readyz")
async def readyz():
    try:
        await redis_client.ping()
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service not ready: {str(e)}")


@app.get("/metrics")
async def metrics():
    return PlainTextResponse(expose_metrics(), media_type="text/plain; version=0.0.4")


@app.post("/planner/plan", response_model=PlannerResponse)
async def planner_plan(request: PlannerRequest):
    plan = build_plan_from_prompt(request)

    with suppress(Exception):
        await append_event(
            "planner.plan_generated",
            {
                "message": "Prompt converted into job plan",
                "job_count": len(plan.jobs),
            },
        )

    return plan


@app.post("/planner/plan-ai", response_model=PlannerResponse)
async def planner_plan_ai(request: PlannerAiRequest):
    plan = build_plan_with_ai(request)

    with suppress(Exception):
        await append_event(
            "planner.ai_plan_generated",
            {
                "message": "Prompt processed with planner AI mode",
                "job_count": len(plan.jobs),
                "planner_source": plan.planner_source,
            },
        )

    return plan


@app.post("/jobs")
async def create_job(job_spec: JobSpec):
    spec = _model_dump(job_spec)
    await save_job_spec(job_spec.job_id, spec)
    await enable_job(job_spec.job_id)
    await append_event(
        "job.created",
        {"job_id": job_spec.job_id, "job_type": job_spec.type, "message": "Job created and enabled"},
    )
    logger.info("Job created", extra={"job_id": job_spec.job_id, "type": job_spec.type})
    return {"job_id": job_spec.job_id, "status": "created"}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    spec = await get_job_spec(job_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Job not found")
    spec["enabled"] = await is_job_enabled(job_id)
    return spec


@app.put("/jobs/{job_id}/enable")
async def enable_job_endpoint(job_id: str):
    spec = await get_job_spec(job_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Job not found")
    await enable_job(job_id)
    await append_event("job.enabled", {"job_id": job_id, "message": "Job enabled"})
    return {"job_id": job_id, "status": "enabled"}


@app.put("/jobs/{job_id}/disable")
async def disable_job_endpoint(job_id: str):
    spec = await get_job_spec(job_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Job not found")
    await disable_job(job_id)
    await append_event("job.disabled", {"job_id": job_id, "message": "Job disabled"})
    return {"job_id": job_id, "status": "disabled"}


@app.post("/jobs/{job_id}/run")
async def trigger_job(job_id: str):
    spec = await get_job_spec(job_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Job not found")

    run_id = f"run_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"
    trace_id = f"trace_{uuid.uuid4().hex}"

    run = Run(
        run_id=run_id,
        job_id=job_id,
        status=RunStatus.QUEUED,
        attempt=0,
        scheduled_at=datetime.now(timezone.utc),
        inputs=spec.get("inputs", {}),
        trace_id=trace_id,
    )
    await save_run(run)
    await add_run_to_job_history(job_id, run_id)

    event = QueueEvent(
        run_id=run_id,
        job_id=job_id,
        type=spec["type"],
        inputs=spec.get("inputs", {}),
        attempt=0,
        scheduled_at=_now_iso(),
        timeout_ms=int(spec.get("timeout_ms", 30000)),
        trace_id=trace_id,
    )
    await enqueue_job(event)
    await append_event(
        "run.queued",
        {"run_id": run_id, "job_id": job_id, "job_type": spec["type"], "source": "manual"},
    )

    return {"run_id": run_id, "job_id": job_id, "status": "queued"}


@app.get("/jobs/{job_id}/runs")
async def get_job_runs(job_id: str, limit: int = 20):
    try:
        run_ids = await get_job_run_ids(job_id, limit)
        runs: List[Dict[str, Any]] = []
        for run_id in run_ids:
            run = await get_run(run_id)
            if run:
                runs.append(_model_dump(run))
        return runs
    except RedisError:
        return _fallback_payload("/jobs/{job_id}/runs", [])


@app.get("/jobs")
async def list_jobs():
    try:
        specs = await list_job_specs()
        enabled_ids = set(await list_enabled_job_ids())

        jobs = []
        for spec in specs:
            job = dict(spec)
            job["enabled"] = spec.get("job_id") in enabled_ids
            jobs.append(job)

        jobs.sort(key=lambda job: job.get("job_id", ""))
        return jobs
    except RedisError:
        return _fallback_payload("/jobs", [])


@app.get("/queue")
async def queue_metrics():
    try:
        return await get_queue_metrics()
    except RedisError:
        return _fallback_payload("/queue", {"depth": 0, "delayed": 0})


@app.get("/connectors")
async def connectors():
    try:
        rows: List[Dict[str, Any]] = []
        keys = sorted(await redis_client.keys("hb:connector:*"))

        for key in keys:
            parts = key.split(":")
            if len(parts) < 4:
                continue
            channel, account_id = parts[2], parts[3]
            status_raw = (await redis_client.get(key)) or "offline"
            ttl = await redis_client.ttl(key)
            status = "online" if status_raw in {"online", "connected"} and ttl > 0 else "offline"
            rows.append(
                {
                    "channel": channel,
                    "account_id": account_id,
                    "status": status,
                    "last_heartbeat_at": _now_iso(),
                    "reconnect_count": 0,
                    "last_error": None,
                }
            )
        return rows
    except RedisError:
        return _fallback_payload("/connectors", [])


@app.get("/agents")
async def agents():
    try:
        rows: List[Dict[str, Any]] = []
        keys = sorted(await redis_client.keys("hb:agent:*:*"))

        for key in keys:
            parts = key.split(":")
            if len(parts) < 4:
                continue

            agent_type, agent_id = parts[2], parts[3]
            heartbeat = await redis_client.get(key)
            ttl = await redis_client.ttl(key)
            status = "online" if ttl > 0 else "offline"

            rows.append(
                {
                    "id": agent_id,
                    "type": agent_type,
                    "status": status,
                    "last_heartbeat": heartbeat or _now_iso(),
                    "last_heartbeat_at": heartbeat or _now_iso(),
                    "active_sessions": 1 if status == "online" else 0,
                    "version": "0.1.0",
                }
            )

        return rows
    except RedisError:
        return _fallback_payload("/agents", _local_agents_snapshot())


@app.get("/runs")
async def runs(
    job_id: Optional[str] = None,
    status: Optional[str] = Query(default=None, pattern="^(queued|running|success|failed)$"),
    limit: int = Query(default=50, ge=1, le=500),
):
    try:
        rows = await list_runs(limit=limit, job_id=job_id, status=status)
        return [_model_dump(run) for run in rows]
    except RedisError:
        return _fallback_payload("/runs", [])


@app.get("/runs/{run_id}")
async def run_detail(run_id: str):
    run = await get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _model_dump(run)


@app.get("/events")
async def events(
    request: Request,
    since: Optional[str] = None,
    limit: int = Query(default=200, ge=1, le=500),
):
    accept = request.headers.get("accept", "")

    if "text/event-stream" in accept:
        async def stream():
            seen_ids = set()
            while True:
                try:
                    rows = await get_events(limit=limit, since=since)
                except RedisError:
                    await asyncio.sleep(1)
                    continue
                for row in rows:
                    event_id = row.get("id")
                    if event_id in seen_ids:
                        continue
                    seen_ids.add(event_id)
                    yield f"data: {json.dumps(row)}\n\n"

                # Keep memory bounded
                if len(seen_ids) > 2000:
                    seen_ids.clear()

                await asyncio.sleep(1)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    try:
        return await get_events(limit=limit, since=since)
    except RedisError:
        return _fallback_payload("/events", [])
