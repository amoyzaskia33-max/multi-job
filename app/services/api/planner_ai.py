import inspect
import json
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

from app.core.models import JobSpec, RetryPolicy, Schedule
from app.services.api.planner import PlannerJob, PlannerRequest, PlannerResponse, build_plan_from_prompt


class PlannerAiRequest(PlannerRequest):
    force_rule_based: bool = False
    model_id: Optional[str] = None
    max_steps: int = Field(default=4, ge=1, le=12)


ALLOWED_JOB_TYPES: Set[str] = {
    "monitor.channel",
    "report.daily",
    "backup.export",
    "agent.workflow",
}

DEFAULT_TIMEOUT_MS: Dict[str, int] = {
    "monitor.channel": 15000,
    "report.daily": 45000,
    "backup.export": 120000,
    "agent.workflow": 90000,
}

DEFAULT_RETRY: Dict[str, RetryPolicy] = {
    "monitor.channel": RetryPolicy(max_retry=5, backoff_sec=[1, 2, 5, 10, 30]),
    "report.daily": RetryPolicy(max_retry=3, backoff_sec=[5, 10, 30]),
    "backup.export": RetryPolicy(max_retry=2, backoff_sec=[10, 30]),
    "agent.workflow": RetryPolicy(max_retry=1, backoff_sec=[2, 5]),
}


def _normalisasi_teks(text: str) -> str:
    return " ".join(text.lower().strip().split())


def _buat_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-").lower()
    return slug or "job"


def _pastikan_id_job_unik(base_id: str, used_ids: Set[str]) -> str:
    candidate = base_id
    suffix = 2
    while candidate in used_ids:
        candidate = f"{base_id}-{suffix}"
        suffix += 1
    used_ids.add(candidate)
    return candidate


def _hapus_duplikat(items: List[str]) -> List[str]:
    seen: Set[str] = set()
    output: List[str] = []
    for item in items:
        cleaned = item.strip()
        if not cleaned:
            continue
        if cleaned in seen:
            continue
        seen.add(cleaned)
        output.append(cleaned)
    return output


def _ekstrak_teks_json(raw: Any) -> Optional[str]:
    if raw is None:
        return None

    if isinstance(raw, dict):
        return json.dumps(raw)

    text = str(raw).strip()
    if not text:
        return None

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    return text[start : end + 1]


def _bangun_prompt_smolagents(request: PlannerAiRequest) -> str:
    return (
        "Kamu adalah planner sistem job backend Python.\n"
        "Ubah prompt user menjadi rencana job terstruktur dalam JSON valid.\n"
        "Kembalikan HANYA JSON (tanpa markdown, tanpa penjelasan).\n"
        "Schema JSON:\n"
        "{\n"
        '  "summary": "string",\n'
        '  "assumptions": ["string"],\n'
        '  "warnings": ["string"],\n'
        '  "jobs": [\n'
        "    {\n"
        '      "job_id": "optional-string",\n'
        '      "type": "monitor.channel|report.daily|backup.export|agent.workflow",\n'
        '      "reason": "string",\n'
        '      "assumptions": ["string"],\n'
        '      "warnings": ["string"],\n'
        '      "schedule": {"interval_sec": 30} atau {"cron": "0 7 * * *"} atau null (agent.workflow),\n'
        '      "timeout_ms": 15000,\n'
        '      "retry_policy": {"max_retry": 3, "backoff_sec": [1,2,5]},\n'
        '      "inputs": {"channel":"telegram","account_id":"bot_a01"} atau {"prompt":"instruksi user"}\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"Prompt user: {request.prompt}\n"
        f"Timezone default: {request.timezone}\n"
        f"Default channel: {request.default_channel}\n"
        f"Default account_id: {request.default_account_id}\n\n"
        "Aturan:\n"
        "1) Gunakan hanya type job yang diizinkan.\n"
        "2) Jika data kurang, isi assumptions dan pakai default aman.\n"
        "3) ID job harus singkat, slug, dan unik.\n"
        "4) Untuk laporan/backup harian, prefer cron.\n"
    )


def _inisialisasi_model_litellm(model_class: Any, model_id: str, api_key: Optional[str]) -> Any:
    attempts: List[Dict[str, Any]] = [
        {"model_id": model_id, "api_key": api_key},
        {"model_id": model_id},
        {"model": model_id, "api_key": api_key},
        {"model": model_id},
    ]

    errors: List[str] = []
    for kwargs in attempts:
        clean_kwargs = {key: value for key, value in kwargs.items() if value is not None}
        try:
            return model_class(**clean_kwargs)
        except Exception as exc:
            errors.append(str(exc))

    raise RuntimeError("Gagal inisialisasi LiteLLMModel: " + " | ".join(errors))


def _buat_code_agent(code_agent_class: Any, model: Any, max_steps: int) -> Any:
    kwargs: Dict[str, Any] = {"tools": [], "model": model}

    try:
        signature = inspect.signature(code_agent_class)
        if "add_base_tools" in signature.parameters:
            kwargs["add_base_tools"] = False
        if "max_steps" in signature.parameters:
            kwargs["max_steps"] = max_steps
    except Exception:
        pass

    return code_agent_class(**kwargs)


def _jalankan_smolagents(request: PlannerAiRequest) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    warnings: List[str] = []

    try:
        import smolagents  # type: ignore
    except Exception:
        return None, ["smolagents belum terpasang. Gunakan: pip install smolagents litellm."]

    code_agent_class = getattr(smolagents, "CodeAgent", None)
    model_class = getattr(smolagents, "LiteLLMModel", None)

    if code_agent_class is None or model_class is None:
        return None, ["Versi smolagents tidak menyediakan CodeAgent/LiteLLMModel."]

    model_id = request.model_id or os.getenv("PLANNER_AI_MODEL", "openai/gpt-4o-mini")
    api_key = os.getenv("OPENAI_API_KEY")

    if model_id.startswith("openai/") and not api_key:
        return None, ["OPENAI_API_KEY belum di-set. Planner AI fallback ke rule-based."]

    try:
        model = _inisialisasi_model_litellm(model_class, model_id=model_id, api_key=api_key)
    except Exception as exc:
        return None, [f"Gagal inisialisasi model AI: {exc}"]

    try:
        agent = _buat_code_agent(code_agent_class, model=model, max_steps=request.max_steps)
        raw_output = agent.run(_bangun_prompt_smolagents(request))
    except Exception as exc:
        return None, [f"Eksekusi smolagents gagal: {exc}"]

    json_text = _ekstrak_teks_json(raw_output)
    if not json_text:
        return None, ["Output AI tidak berbentuk JSON yang valid."]

    try:
        payload = json.loads(json_text)
    except Exception as exc:
        return None, [f"Gagal parse JSON dari output AI: {exc}"]

    if not isinstance(payload, dict):
        return None, ["Payload AI bukan object JSON."]

    return payload, warnings


def _paksa_jadwal(raw: Any, warnings: List[str], index: int) -> Optional[Schedule]:
    if not isinstance(raw, dict):
        warnings.append(f"Job #{index + 1}: schedule tidak valid, pakai default.")
        return None

    cron = raw.get("cron")
    interval_sec = raw.get("interval_sec")
    if cron is None and interval_sec is None:
        warnings.append(f"Job #{index + 1}: schedule kosong, pakai default.")
        return None

    if interval_sec is not None:
        try:
            interval_sec = int(interval_sec)
        except Exception:
            warnings.append(f"Job #{index + 1}: interval_sec tidak valid, diabaikan.")
            interval_sec = None

    try:
        return Schedule(cron=cron, interval_sec=interval_sec)
    except Exception:
        warnings.append(f"Job #{index + 1}: format schedule tidak valid, pakai default.")
        return None


def _jadwal_default_per_job(job_type: str) -> Optional[Schedule]:
    if job_type == "monitor.channel":
        return Schedule(interval_sec=30)
    if job_type == "report.daily":
        return Schedule(cron="0 7 * * *")
    if job_type == "agent.workflow":
        return None
    return Schedule(cron="0 2 * * *")


def _retry_default(job_type: str) -> RetryPolicy:
    source = DEFAULT_RETRY[job_type]
    return RetryPolicy(max_retry=source.max_retry, backoff_sec=list(source.backoff_sec))


def build_plan_from_ai_payload(request: PlannerAiRequest, payload: Dict[str, Any]) -> PlannerResponse:
    normalized_prompt = _normalisasi_teks(request.prompt)
    assumptions: List[str] = []
    warnings: List[str] = []
    jobs: List[PlannerJob] = []
    used_ids: Set[str] = set()

    assumptions.extend(payload.get("assumptions", []) if isinstance(payload.get("assumptions"), list) else [])
    warnings.extend(payload.get("warnings", []) if isinstance(payload.get("warnings"), list) else [])

    raw_jobs = payload.get("jobs")
    if not isinstance(raw_jobs, list):
        warnings.append("Payload AI tidak memiliki daftar jobs yang valid.")
        raw_jobs = []

    for index, item in enumerate(raw_jobs):
        if not isinstance(item, dict):
            warnings.append(f"Item jobs #{index + 1} bukan object, dilewati.")
            continue

        job_type = str(item.get("type") or "").strip()
        if job_type not in ALLOWED_JOB_TYPES:
            warnings.append(f"Job #{index + 1}: type '{job_type}' tidak didukung, dilewati.")
            continue

        reason = str(item.get("reason") or f"Dibuat oleh planner AI untuk type {job_type}.")
        item_assumptions = item.get("assumptions", []) if isinstance(item.get("assumptions"), list) else []
        item_warnings = item.get("warnings", []) if isinstance(item.get("warnings"), list) else []

        if job_type == "agent.workflow":
            schedule = None
        else:
            schedule = _paksa_jadwal(item.get("schedule"), warnings, index) or _jadwal_default_per_job(job_type)

        retry_raw = item.get("retry_policy")
        retry_policy: RetryPolicy
        if isinstance(retry_raw, dict):
            try:
                retry_policy = RetryPolicy(
                    max_retry=int(retry_raw.get("max_retry", DEFAULT_RETRY[job_type].max_retry)),
                    backoff_sec=list(retry_raw.get("backoff_sec", DEFAULT_RETRY[job_type].backoff_sec)),
                )
            except Exception:
                retry_policy = _retry_default(job_type)
                warnings.append(f"Job #{index + 1}: retry_policy tidak valid, pakai default.")
        else:
            retry_policy = _retry_default(job_type)

        timeout_ms = item.get("timeout_ms", DEFAULT_TIMEOUT_MS[job_type])
        try:
            timeout_ms = int(timeout_ms)
        except Exception:
            timeout_ms = DEFAULT_TIMEOUT_MS[job_type]
            warnings.append(f"Job #{index + 1}: timeout_ms tidak valid, pakai default.")

        inputs = item.get("inputs", {})
        if not isinstance(inputs, dict):
            inputs = {}
            warnings.append(f"Job #{index + 1}: inputs tidak valid, pakai object kosong.")

        if job_type == "monitor.channel":
            inputs.setdefault("channel", request.default_channel)
            inputs.setdefault("account_id", request.default_account_id)
        if job_type == "agent.workflow":
            inputs.setdefault("prompt", request.prompt)
            inputs.setdefault("timezone", request.timezone)
            inputs.setdefault("default_channel", request.default_channel)
            inputs.setdefault("default_account_id", request.default_account_id)
        if job_type in {"report.daily", "backup.export"}:
            inputs.setdefault("timezone", request.timezone)
        inputs.setdefault("source", "planner_ai")

        base_id = str(item.get("job_id") or _buat_slug(f"{job_type}-{index + 1}"))
        job_id = _pastikan_id_job_unik(_buat_slug(base_id), used_ids)

        try:
            job_spec = JobSpec(
                job_id=job_id,
                type=job_type,
                schedule=schedule,
                timeout_ms=timeout_ms,
                retry_policy=retry_policy,
                inputs=inputs,
            )
        except Exception as exc:
            warnings.append(f"Job #{index + 1}: gagal validasi JobSpec ({exc}), dilewati.")
            continue

        jobs.append(
            PlannerJob(
                reason=reason,
                assumptions=item_assumptions,
                warnings=item_warnings,
                job_spec=job_spec,
            )
        )

    for job in jobs:
        assumptions.extend(job.assumptions)
        warnings.extend(job.warnings)

    assumptions = _hapus_duplikat(assumptions)
    warnings = _hapus_duplikat(warnings)

    summary = str(payload.get("summary") or f"Planner AI menghasilkan {len(jobs)} rencana tugas.")
    if not jobs:
        summary = "Planner AI belum menghasilkan job valid."

    return PlannerResponse(
        prompt=request.prompt,
        normalized_prompt=normalized_prompt,
        summary=summary,
        planner_source="smolagents",
        assumptions=assumptions,
        warnings=warnings,
        jobs=jobs,
    )


def build_plan_with_ai(request: PlannerAiRequest) -> PlannerResponse:
    fallback_plan = build_plan_from_prompt(request)

    if request.force_rule_based:
        fallback_plan.warnings = _hapus_duplikat(
            [*fallback_plan.warnings, "force_rule_based aktif: planner AI dilewati."]
        )
        return fallback_plan

    payload, ai_warnings = _jalankan_smolagents(request)
    if payload is None:
        fallback_plan.warnings = _hapus_duplikat(
            [
                *fallback_plan.warnings,
                *ai_warnings,
                "Planner AI gagal dipakai. Sistem otomatis memakai planner rule-based.",
            ]
        )
        return fallback_plan

    ai_plan = build_plan_from_ai_payload(request, payload)
    if not ai_plan.jobs:
        fallback_plan.warnings = _hapus_duplikat(
            [
                *fallback_plan.warnings,
                *ai_warnings,
                *ai_plan.warnings,
                "Planner AI tidak menghasilkan job valid. Sistem memakai planner rule-based.",
            ]
        )
        return fallback_plan

    ai_plan.warnings = _hapus_duplikat([*ai_plan.warnings, *ai_warnings])
    return ai_plan
