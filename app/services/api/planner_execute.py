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
from app.services.api.planner_ai import PlannerAiRequest, build_plan_with_ai_dari_dashboard


def _serialisasi_model(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()


def _sekarang_iso() -> str:
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


async def _antrikan_run_dari_spesifikasi(job_id: str, spesifikasi: Dict[str, Any]) -> Dict[str, str]:
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
        {"run_id": run_id, "job_id": job_id, "job_type": spesifikasi["type"], "source": "planner_execute"},
    )

    return {"run_id": run_id, "status": "queued"}


async def execute_prompt_plan(request: PlannerExecuteRequest) -> PlannerExecuteResponse:
    if request.use_ai:
        rencana = await build_plan_with_ai_dari_dashboard(request)
    else:
        rencana = build_plan_from_prompt(request)

    daftar_hasil: List[PlannerExecutionResult] = []

    for rencana_job in rencana.jobs:
        model_spesifikasi = rencana_job.job_spec
        spesifikasi = _serialisasi_model(model_spesifikasi)
        job_id = spesifikasi["job_id"]
        tipe_job = spesifikasi["type"]

        try:
            sudah_ada = await get_job_spec(job_id) is not None
            await save_job_spec(job_id, spesifikasi)
            await enable_job(job_id)

            await append_event(
                "job.created" if not sudah_ada else "job.updated",
                {
                    "job_id": job_id,
                    "job_type": tipe_job,
                    "message": "Job saved from planner execute",
                    "planner_source": rencana.planner_source,
                },
            )

            hasil = PlannerExecutionResult(
                job_id=job_id,
                type=tipe_job,
                create_status="updated" if sudah_ada else "created",
            )

            if request.run_immediately:
                respons_run = await _antrikan_run_dari_spesifikasi(job_id, spesifikasi)
                hasil.run_id = respons_run["run_id"]
                hasil.queue_status = respons_run["status"]

                if request.wait_seconds > 0:
                    await asyncio.sleep(request.wait_seconds)
                    data_run = await get_run(respons_run["run_id"])
                    if data_run:
                        hasil.run_status = (
                            data_run.status.value if hasattr(data_run.status, "value") else str(data_run.status)
                        )
                        if data_run.result:
                            hasil.result_success = data_run.result.success
                            hasil.result_error = data_run.result.error

            daftar_hasil.append(hasil)
        except Exception as error:
            daftar_hasil.append(
                PlannerExecutionResult(
                    job_id=job_id,
                    type=tipe_job,
                    create_status="error",
                    result_error=str(error),
                )
            )

    return PlannerExecuteResponse(
        planner_source=rencana.planner_source,
        summary=rencana.summary,
        assumptions=rencana.assumptions,
        warnings=rencana.warnings,
        results=daftar_hasil,
    )
