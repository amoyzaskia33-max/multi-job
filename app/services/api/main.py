import asyncio
import json
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field
from redis.exceptions import RedisError, TimeoutError as RedisTimeoutError

from app.core.connector_accounts import (
    delete_telegram_account,
    get_telegram_account,
    list_telegram_accounts,
    upsert_telegram_account,
)
from app.core.integration_configs import (
    delete_integration_account,
    delete_mcp_server,
    get_integration_account,
    get_mcp_server,
    list_integration_accounts,
    list_mcp_servers,
    upsert_integration_account,
    upsert_mcp_server,
)
from app.core.integration_catalog import (
    get_mcp_server_template,
    get_provider_template,
    list_mcp_server_templates,
    list_provider_templates,
)
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
    set_mode_fallback_redis,
)
from app.core.scheduler import Scheduler
from app.core.redis_client import close_redis, redis_client
from app.services.api.planner import PlannerRequest, PlannerResponse, build_plan_from_prompt
from app.services.api.planner_ai import PlannerAiRequest, build_plan_with_ai
from app.services.api.planner_execute import PlannerExecuteRequest, PlannerExecuteResponse, execute_prompt_plan
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
    app.state.redis_ready = False
    set_mode_fallback_redis(True)
    logger.warning("Redis request failed", extra={"path": request.url.path, "error": str(exc)})
    return JSONResponse(
        status_code=503,
        content={"detail": "Redis is unavailable. Service is running in degraded mode."},
    )


def _serialisasi_model(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()


def _sekarang_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fallback_payload(endpoint: str, payload: Any) -> Any:
    logger.warning("Serving degraded fallback payload", extra={"endpoint": endpoint})
    return payload


def _merge_config_defaults(existing: Dict[str, Any], defaults: Dict[str, Any], overwrite: bool) -> Dict[str, Any]:
    merged = dict(existing) if isinstance(existing, dict) else {}
    for key, value in defaults.items():
        if overwrite or key not in merged:
            merged[key] = value
    return merged


async def _is_redis_ready() -> bool:
    try:
        await asyncio.wait_for(redis_client.ping(), timeout=0.5)
        return True
    except Exception:
        return False


def _local_agents_snapshot() -> List[Dict[str, Any]]:
    sekarang = _sekarang_iso()
    rows: List[Dict[str, Any]] = []

    worker_task = getattr(app.state, "local_worker_task", None)
    scheduler_task = getattr(app.state, "local_scheduler_task", None)

    if worker_task:
        rows.append(
            {
                "id": "local-worker",
                "type": "worker",
                "status": "offline" if worker_task.done() else "online",
                "last_heartbeat": sekarang,
                "last_heartbeat_at": sekarang,
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
                "last_heartbeat": sekarang,
                "last_heartbeat_at": sekarang,
                "active_sessions": 1 if not scheduler_task.done() else 0,
                "version": "local-fallback",
            }
        )

    return rows


class TelegramConnectorAccountUpsert(BaseModel):
    bot_token: Optional[str] = None
    allowed_chat_ids: List[str] = Field(default_factory=list)
    enabled: bool = True
    use_ai: bool = True
    force_rule_based: bool = False
    run_immediately: bool = True
    wait_seconds: int = Field(default=2, ge=0, le=30)
    timezone: str = "Asia/Jakarta"
    default_channel: str = "telegram"
    default_account_id: str = "default"


class TelegramConnectorAccountView(BaseModel):
    account_id: str
    enabled: bool = True
    has_bot_token: bool = False
    bot_token_masked: Optional[str] = None
    allowed_chat_ids: List[str] = Field(default_factory=list)
    use_ai: bool = True
    force_rule_based: bool = False
    run_immediately: bool = True
    wait_seconds: int = 2
    timezone: str = "Asia/Jakarta"
    default_channel: str = "telegram"
    default_account_id: str = "default"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class McpServerUpsertRequest(BaseModel):
    enabled: bool = True
    transport: str = "stdio"
    description: str = ""
    command: str = ""
    args: List[str] = Field(default_factory=list)
    url: str = ""
    headers: Dict[str, str] = Field(default_factory=dict)
    env: Dict[str, str] = Field(default_factory=dict)
    auth_token: Optional[str] = None
    timeout_sec: int = Field(default=20, ge=1, le=120)


class McpServerView(BaseModel):
    server_id: str
    enabled: bool = True
    transport: str = "stdio"
    description: str = ""
    command: str = ""
    args: List[str] = Field(default_factory=list)
    url: str = ""
    headers: Dict[str, str] = Field(default_factory=dict)
    env: Dict[str, str] = Field(default_factory=dict)
    has_auth_token: bool = False
    auth_token_masked: Optional[str] = None
    timeout_sec: int = 20
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class IntegrationAccountUpsertRequest(BaseModel):
    enabled: bool = True
    secret: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class IntegrationAccountView(BaseModel):
    provider: str
    account_id: str
    enabled: bool = True
    has_secret: bool = False
    secret_masked: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class IntegrationProviderTemplateView(BaseModel):
    provider: str
    label: str
    description: str
    auth_hint: str
    default_account_id: str = "default"
    default_enabled: bool = False
    default_config: Dict[str, Any] = Field(default_factory=dict)


class McpServerTemplateView(BaseModel):
    template_id: str
    server_id: str
    label: str
    description: str
    transport: str
    command: str = ""
    args: List[str] = Field(default_factory=list)
    url: str = ""
    headers: Dict[str, str] = Field(default_factory=dict)
    env: Dict[str, str] = Field(default_factory=dict)
    timeout_sec: int = 20
    default_enabled: bool = False


class IntegrationsCatalogView(BaseModel):
    providers: List[IntegrationProviderTemplateView] = Field(default_factory=list)
    mcp_servers: List[McpServerTemplateView] = Field(default_factory=list)


class IntegrationsBootstrapRequest(BaseModel):
    provider_ids: List[str] = Field(default_factory=list)
    mcp_template_ids: List[str] = Field(default_factory=list)
    account_id: str = "default"
    overwrite: bool = False


class IntegrationsBootstrapResponse(BaseModel):
    account_id: str
    overwrite: bool
    providers_created: List[str] = Field(default_factory=list)
    providers_updated: List[str] = Field(default_factory=list)
    providers_skipped: List[str] = Field(default_factory=list)
    mcp_created: List[str] = Field(default_factory=list)
    mcp_updated: List[str] = Field(default_factory=list)
    mcp_skipped: List[str] = Field(default_factory=list)


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

    redis_ready = await _is_redis_ready()
    app.state.redis_ready = redis_ready
    set_mode_fallback_redis(not redis_ready)

    if redis_ready:
        await init_queue()

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
        await asyncio.wait_for(redis_client.ping(), timeout=0.5)
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service not ready: {str(e)}")


@app.get("/metrics")
async def metrics():
    return PlainTextResponse(expose_metrics(), media_type="text/plain; version=0.0.4")


@app.post("/planner/plan", response_model=PlannerResponse)
async def planner_plan(request: PlannerRequest):
    rencana = build_plan_from_prompt(request)

    with suppress(Exception):
        await append_event(
            "planner.plan_generated",
            {
                "message": "Prompt converted into job plan",
                "job_count": len(rencana.jobs),
            },
        )

    return rencana


@app.post("/planner/plan-ai", response_model=PlannerResponse)
async def planner_plan_ai(request: PlannerAiRequest):
    rencana = build_plan_with_ai(request)

    with suppress(Exception):
        await append_event(
            "planner.ai_plan_generated",
            {
                "message": "Prompt processed with planner AI mode",
                "job_count": len(rencana.jobs),
                "planner_source": rencana.planner_source,
            },
        )

    return rencana


@app.post("/planner/execute", response_model=PlannerExecuteResponse)
async def planner_execute(request: PlannerExecuteRequest):
    eksekusi = await execute_prompt_plan(request)

    with suppress(Exception):
        await append_event(
            "planner.execute_completed",
            {
                "message": "Prompt planned and executed",
                "planner_source": eksekusi.planner_source,
                "result_count": len(eksekusi.results),
            },
        )

    return eksekusi


@app.post("/jobs")
async def create_job(job_spec: JobSpec):
    spesifikasi = _serialisasi_model(job_spec)
    await save_job_spec(job_spec.job_id, spesifikasi)
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
    spesifikasi = await get_job_spec(job_id)
    if not spesifikasi:
        raise HTTPException(status_code=404, detail="Job not found")

    run_id = f"run_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"
    trace_id = f"trace_{uuid.uuid4().hex}"

    data_run = Run(
        run_id=run_id,
        job_id=job_id,
        status=RunStatus.QUEUED,
        attempt=0,
        scheduled_at=datetime.now(timezone.utc),
        inputs=spesifikasi.get("inputs", {}),
        trace_id=trace_id,
    )
    await save_run(data_run)
    await add_run_to_job_history(job_id, run_id)

    event_antrean = QueueEvent(
        run_id=run_id,
        job_id=job_id,
        type=spesifikasi["type"],
        inputs=spesifikasi.get("inputs", {}),
        attempt=0,
        scheduled_at=_sekarang_iso(),
        timeout_ms=int(spesifikasi.get("timeout_ms", 30000)),
        trace_id=trace_id,
    )
    await enqueue_job(event_antrean)
    await append_event(
        "run.queued",
        {"run_id": run_id, "job_id": job_id, "job_type": spesifikasi["type"], "source": "manual"},
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
                runs.append(_serialisasi_model(run))
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


@app.get("/connector/telegram/accounts", response_model=List[TelegramConnectorAccountView])
async def list_telegram_connector_accounts():
    return await list_telegram_accounts(include_secret=False)


@app.get("/connector/telegram/accounts/{account_id}", response_model=TelegramConnectorAccountView)
async def get_telegram_connector_account(account_id: str):
    row = await get_telegram_account(account_id, include_secret=False)
    if not row:
        raise HTTPException(status_code=404, detail="Telegram account not found")
    return row


@app.put("/connector/telegram/accounts/{account_id}", response_model=TelegramConnectorAccountView)
async def upsert_telegram_connector_account(account_id: str, request: TelegramConnectorAccountUpsert):
    try:
        row = await upsert_telegram_account(account_id, request.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await append_event(
        "connector.telegram.account_upserted",
        {
            "account_id": account_id,
            "enabled": row.get("enabled", True),
            "has_bot_token": row.get("has_bot_token", False),
        },
    )

    return row


@app.delete("/connector/telegram/accounts/{account_id}")
async def delete_telegram_connector_account(account_id: str):
    removed = await delete_telegram_account(account_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Telegram account not found")

    await append_event(
        "connector.telegram.account_deleted",
        {"account_id": account_id},
    )

    return {"account_id": account_id, "status": "deleted"}


@app.get("/integrations/mcp/servers", response_model=List[McpServerView])
async def list_mcp_integration_servers():
    return await list_mcp_servers(include_secret=False)


@app.get("/integrations/mcp/servers/{server_id}", response_model=McpServerView)
async def get_mcp_integration_server(server_id: str):
    row = await get_mcp_server(server_id, include_secret=False)
    if not row:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return row


@app.put("/integrations/mcp/servers/{server_id}", response_model=McpServerView)
async def upsert_mcp_integration_server(server_id: str, request: McpServerUpsertRequest):
    try:
        row = await upsert_mcp_server(server_id, request.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await append_event(
        "integration.mcp_server_upserted",
        {
            "server_id": server_id,
            "enabled": row.get("enabled", True),
            "transport": row.get("transport", "stdio"),
        },
    )

    return row


@app.delete("/integrations/mcp/servers/{server_id}")
async def delete_mcp_integration_server(server_id: str):
    removed = await delete_mcp_server(server_id)
    if not removed:
        raise HTTPException(status_code=404, detail="MCP server not found")

    await append_event("integration.mcp_server_deleted", {"server_id": server_id})
    return {"server_id": server_id, "status": "deleted"}


@app.get("/integrations/accounts", response_model=List[IntegrationAccountView])
async def list_integration_accounts_endpoint(provider: Optional[str] = None):
    try:
        return await list_integration_accounts(provider=provider, include_secret=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/integrations/accounts/{provider}/{account_id}", response_model=IntegrationAccountView)
async def get_integration_account_endpoint(provider: str, account_id: str):
    try:
        row = await get_integration_account(provider, account_id, include_secret=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not row:
        raise HTTPException(status_code=404, detail="Integration account not found")
    return row


@app.put("/integrations/accounts/{provider}/{account_id}", response_model=IntegrationAccountView)
async def upsert_integration_account_endpoint(
    provider: str,
    account_id: str,
    request: IntegrationAccountUpsertRequest,
):
    try:
        row = await upsert_integration_account(provider, account_id, request.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await append_event(
        "integration.account_upserted",
        {"provider": row.get("provider"), "account_id": row.get("account_id"), "enabled": row.get("enabled", True)},
    )
    return row


@app.delete("/integrations/accounts/{provider}/{account_id}")
async def delete_integration_account_endpoint(provider: str, account_id: str):
    try:
        removed = await delete_integration_account(provider, account_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not removed:
        raise HTTPException(status_code=404, detail="Integration account not found")

    await append_event("integration.account_deleted", {"provider": provider, "account_id": account_id})
    return {"provider": provider, "account_id": account_id, "status": "deleted"}


@app.get("/integrations/catalog", response_model=IntegrationsCatalogView)
async def get_integrations_catalog():
    return {
        "providers": list_provider_templates(),
        "mcp_servers": list_mcp_server_templates(),
    }


@app.post("/integrations/catalog/bootstrap", response_model=IntegrationsBootstrapResponse)
async def bootstrap_integrations_catalog(request: IntegrationsBootstrapRequest):
    account_id = request.account_id.strip() or "default"

    selected_provider_ids = [value.strip().lower() for value in request.provider_ids if value.strip()]
    selected_mcp_template_ids = [value.strip().lower() for value in request.mcp_template_ids if value.strip()]

    if not selected_provider_ids:
        selected_provider_ids = [
            str(row.get("provider", "")).strip().lower()
            for row in list_provider_templates()
            if str(row.get("provider", "")).strip()
        ]
    if not selected_mcp_template_ids:
        selected_mcp_template_ids = [
            str(row.get("template_id", "")).strip().lower()
            for row in list_mcp_server_templates()
            if str(row.get("template_id", "")).strip()
        ]

    providers_created: List[str] = []
    providers_updated: List[str] = []
    providers_skipped: List[str] = []

    mcp_created: List[str] = []
    mcp_updated: List[str] = []
    mcp_skipped: List[str] = []

    for provider_id in selected_provider_ids:
        template = get_provider_template(provider_id)
        if not template:
            raise HTTPException(status_code=400, detail=f"Unknown provider template: {provider_id}")

        provider = str(template.get("provider", "")).strip().lower()
        existing = await get_integration_account(provider, account_id, include_secret=False)

        if existing and not request.overwrite:
            providers_skipped.append(provider)
            continue

        existing_config = existing.get("config", {}) if isinstance(existing, dict) else {}
        template_config = template.get("default_config", {})
        payload = {
            "enabled": (
                bool(template.get("default_enabled", False))
                if request.overwrite or not existing
                else bool(existing.get("enabled", True))
            ),
            "config": _merge_config_defaults(existing_config, template_config, overwrite=request.overwrite),
        }

        await upsert_integration_account(provider, account_id, payload)
        if existing:
            providers_updated.append(provider)
        else:
            providers_created.append(provider)

    for template_id in selected_mcp_template_ids:
        template = get_mcp_server_template(template_id)
        if not template:
            raise HTTPException(status_code=400, detail=f"Unknown MCP template: {template_id}")

        server_id = str(template.get("server_id", "")).strip()
        existing = await get_mcp_server(server_id, include_secret=False)

        if existing and not request.overwrite:
            mcp_skipped.append(server_id)
            continue

        existing_headers = existing.get("headers", {}) if isinstance(existing, dict) else {}
        existing_env = existing.get("env", {}) if isinstance(existing, dict) else {}

        payload = {
            "enabled": (
                bool(template.get("default_enabled", False))
                if request.overwrite or not existing
                else bool(existing.get("enabled", True))
            ),
            "transport": str(template.get("transport", "stdio")),
            "description": str(template.get("description", "")),
            "command": str(template.get("command", "")),
            "args": list(template.get("args", [])),
            "url": str(template.get("url", "")),
            "headers": _merge_config_defaults(existing_headers, template.get("headers", {}), overwrite=request.overwrite),
            "env": _merge_config_defaults(existing_env, template.get("env", {}), overwrite=request.overwrite),
            "timeout_sec": int(template.get("timeout_sec", 20)),
        }

        try:
            await upsert_mcp_server(server_id, payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        if existing:
            mcp_updated.append(server_id)
        else:
            mcp_created.append(server_id)

    await append_event(
        "integration.catalog_bootstrap",
        {
            "account_id": account_id,
            "overwrite": request.overwrite,
            "providers_created": len(providers_created),
            "providers_updated": len(providers_updated),
            "providers_skipped": len(providers_skipped),
            "mcp_created": len(mcp_created),
            "mcp_updated": len(mcp_updated),
            "mcp_skipped": len(mcp_skipped),
        },
    )

    return {
        "account_id": account_id,
        "overwrite": request.overwrite,
        "providers_created": providers_created,
        "providers_updated": providers_updated,
        "providers_skipped": providers_skipped,
        "mcp_created": mcp_created,
        "mcp_updated": mcp_updated,
        "mcp_skipped": mcp_skipped,
    }


@app.get("/connectors")
async def connectors():
    if not getattr(app.state, "redis_ready", True):
        return _fallback_payload("/connectors", [])

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
                    "last_heartbeat_at": _sekarang_iso(),
                    "reconnect_count": 0,
                    "last_error": None,
                }
            )
        return rows
    except RedisError:
        return _fallback_payload("/connectors", [])


@app.get("/agents")
async def agents():
    if not getattr(app.state, "redis_ready", True):
        return _fallback_payload("/agents", _local_agents_snapshot())

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
                    "last_heartbeat": heartbeat or _sekarang_iso(),
                    "last_heartbeat_at": heartbeat or _sekarang_iso(),
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
        return [_serialisasi_model(run) for run in rows]
    except RedisError:
        return _fallback_payload("/runs", [])


@app.get("/runs/{run_id}")
async def run_detail(run_id: str):
    run = await get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return _serialisasi_model(run)


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
