import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.core.models import QueueEvent, Run, RunStatus
from app.core.queue import (
    add_run_to_job_history,
    append_event,
    enable_job,
    enqueue_job,
    get_job_spec,
    get_run,
    save_job_spec,
    save_run,
)
from app.services.api.planner import build_plan_from_prompt
from app.services.api.planner_ai import PlannerAiRequest, build_plan_with_ai


def _model_dump(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PlannerExecuteRequest(PlannerAiRequest):
    use_ai: bool = True
    run_immediately: bool = True
    wait_seconds: int = Field(default=0, ge=0, le=30)


class PlannerExecutionResult(BaseModel):
    job_id: str
    type: str
    create_status: str
    run_id: Optional[str] = None
    queue_status: Optional[str] = None
    run_status: Optional[str] = None
    result_success: Optional[bool] = None
    result_error: Optional[str] = None


class PlannerExecuteResponse(BaseModel):
    planner_source: str
    summary: str
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    results: List[PlannerExecutionResult] = Field(default_factory=list)


async def _enqueue_run_from_spec(job_id: str, spec: Dict[str, Any]) -> Dict[str, str]:
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
        {"run_id": run_id, "job_id": job_id, "job_type": spec["type"], "source": "planner_execute"},
    )

    return {"run_id": run_id, "status": "queued"}


async def execute_prompt_plan(request: PlannerExecuteRequest) -> PlannerExecuteResponse:
    if request.use_ai:
        plan = build_plan_with_ai(request)
    else:
        plan = build_plan_from_prompt(request)

    results: List[PlannerExecutionResult] = []

    for planned in plan.jobs:
        spec_model = planned.job_spec
        spec = _model_dump(spec_model)
        job_id = spec["job_id"]
        job_type = spec["type"]

        try:
            existed = await get_job_spec(job_id) is not None
            await save_job_spec(job_id, spec)
            await enable_job(job_id)

            await append_event(
                "job.created" if not existed else "job.updated",
                {
                    "job_id": job_id,
                    "job_type": job_type,
                    "message": "Job saved from planner execute",
                    "planner_source": plan.planner_source,
                },
            )

            result = PlannerExecutionResult(
                job_id=job_id,
                type=job_type,
                create_status="updated" if existed else "created",
            )

            if request.run_immediately:
                run_resp = await _enqueue_run_from_spec(job_id, spec)
                result.run_id = run_resp["run_id"]
                result.queue_status = run_resp["status"]

                if request.wait_seconds > 0:
                    await asyncio.sleep(request.wait_seconds)
                    run = await get_run(run_resp["run_id"])
                    if run:
                        result.run_status = run.status.value if hasattr(run.status, "value") else str(run.status)
                        if run.result:
                            result.result_success = run.result.success
                            result.result_error = run.result.error

            results.append(result)
        except Exception as exc:
            results.append(
                PlannerExecutionResult(
                    job_id=job_id,
                    type=job_type,
                    create_status="error",
                    result_error=str(exc),
                )
            )

    return PlannerExecuteResponse(
        planner_source=plan.planner_source,
        summary=plan.summary,
        assumptions=plan.assumptions,
        warnings=plan.warnings,
        results=results,
    )
