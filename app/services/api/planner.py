import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

from app.core.models import JobSpec, RetryPolicy, Schedule


class PlannerRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1000)
    timezone: str = "Asia/Jakarta"
    default_channel: str = "telegram"
    default_account_id: str = "default"


class PlannerJob(BaseModel):
    reason: str
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    job_spec: JobSpec


class PlannerResponse(BaseModel):
    prompt: str
    normalized_prompt: str
    summary: str
    planner_source: str = "rule_based"
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    jobs: List[PlannerJob] = Field(default_factory=list)


CHANNEL_ALIASES: Dict[str, List[str]] = {
    "telegram": ["telegram", "tg"],
    "whatsapp": ["whatsapp", "wa"],
    "slack": ["slack"],
    "discord": ["discord"],
    "email": ["email", "gmail"],
}


def _normalisasi_teks(text: str) -> str:
    return " ".join(text.lower().strip().split())


def _buat_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-").lower()
    return slug or "job"


def _memuat_salah_satu(text: str, keywords: List[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def _memuat_kata_harian(text: str) -> bool:
    return _memuat_salah_satu(text, ["harian", "setiap hari", "daily"])


def _memuat_kata_agen(text: str) -> bool:
    return _memuat_salah_satu(
        text,
        [
            "agent",
            "workflow",
            "otomasi",
            "otomatis",
            "integrasi",
            "mcp",
            "github",
            "notion",
            "linear",
            "openai",
            "api",
            "sinkron",
            "hubungkan",
        ],
    )


def _ekstrak_interval_detik(text: str) -> Optional[int]:
    match = re.search(r"(?:tiap|setiap|per)\s+(\d+)\s*(detik|menit|jam)", text)
    if not match:
        return None

    value = int(match.group(1))
    unit = match.group(2)
    if value <= 0:
        return None

    if unit == "detik":
        return value
    if unit == "menit":
        return value * 60
    return value * 3600


def _ekstrak_cron_harian(text: str) -> Optional[str]:
    time_match = re.search(r"(?:jam|pukul)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam)?", text)
    if not time_match:
        return None

    hour = int(time_match.group(1))
    minute = int(time_match.group(2) or "0")
    period = time_match.group(3)

    if period == "siang":
        if hour < 11:
            hour += 12
    elif period in {"sore", "malam"}:
        if hour < 12:
            hour += 12
    elif period == "pagi" and hour == 12:
        hour = 0

    if hour > 23 or minute > 59:
        return None

    return f"{minute} {hour} * * *"


def _deteksi_kanal(text: str, default_channel: str) -> Tuple[str, Optional[str]]:
    for channel, aliases in CHANNEL_ALIASES.items():
        for alias in aliases:
            if re.search(rf"\b{re.escape(alias)}\b", text):
                return channel, None

    return default_channel, f"Kanal tidak disebutkan, pakai default '{default_channel}'."


def _deteksi_id_akun(text: str, default_account_id: str) -> Tuple[str, Optional[str]]:
    pattern = r"(?:account[_\s-]?id|akun|account|id akun)\s*[:=]?\s*([a-zA-Z0-9_.:-]+)"
    match = re.search(pattern, text)
    if match:
        return match.group(1), None

    return default_account_id, f"ID akun tidak disebutkan, pakai default '{default_account_id}'."


def _pastikan_id_job_unik(base_id: str, used_ids: Set[str]) -> str:
    candidate = base_id
    suffix = 2
    while candidate in used_ids:
        candidate = f"{base_id}-{suffix}"
        suffix += 1
    used_ids.add(candidate)
    return candidate


def _bangun_job_monitor(
    text: str,
    request: PlannerRequest,
    used_ids: Set[str],
) -> PlannerJob:
    assumptions: List[str] = []
    warnings: List[str] = []

    channel, channel_assumption = _deteksi_kanal(text, request.default_channel)
    if channel_assumption:
        assumptions.append(channel_assumption)

    account_id, account_assumption = _deteksi_id_akun(text, request.default_account_id)
    if account_assumption:
        assumptions.append(account_assumption)

    interval_sec = _ekstrak_interval_detik(text)
    if interval_sec:
        schedule = Schedule(interval_sec=interval_sec)
    else:
        schedule = Schedule(interval_sec=30)
        assumptions.append("Interval tidak disebutkan, pakai default 30 detik.")

    base_id = _buat_slug(f"monitor-{channel}-{account_id}")
    job_id = _pastikan_id_job_unik(base_id, used_ids)

    job_spec = JobSpec(
        job_id=job_id,
        type="monitor.channel",
        schedule=schedule,
        timeout_ms=15000,
        retry_policy=RetryPolicy(max_retry=5, backoff_sec=[1, 2, 5, 10, 30]),
        inputs={
            "channel": channel,
            "account_id": account_id,
            "source": "planner_prompt",
        },
    )

    return PlannerJob(
        reason="Prompt meminta pemantauan kanal/koneksi.",
        assumptions=assumptions,
        warnings=warnings,
        job_spec=job_spec,
    )


def _bangun_job_laporan(
    text: str,
    request: PlannerRequest,
    used_ids: Set[str],
) -> PlannerJob:
    assumptions: List[str] = []
    warnings: List[str] = []

    cron = _ekstrak_cron_harian(text)
    if cron:
        schedule = Schedule(cron=cron)
        minute, hour, _, _, _ = cron.split(" ")
        schedule_tag = f"harian-{hour.zfill(2)}{minute.zfill(2)}"
    elif _memuat_kata_harian(text):
        schedule = Schedule(cron="0 7 * * *")
        schedule_tag = "harian-0700"
        assumptions.append("Waktu laporan tidak disebutkan, pakai default 07:00.")
    else:
        interval_sec = _ekstrak_interval_detik(text)
        if interval_sec:
            schedule = Schedule(interval_sec=interval_sec)
            schedule_tag = f"interval-{interval_sec}s"
        else:
            schedule = Schedule(cron="0 7 * * *")
            schedule_tag = "harian-0700"
            assumptions.append("Jadwal laporan tidak disebutkan, pakai default harian jam 07:00.")

    base_id = _buat_slug(f"report-daily-{schedule_tag}")
    job_id = _pastikan_id_job_unik(base_id, used_ids)

    job_spec = JobSpec(
        job_id=job_id,
        type="report.daily",
        schedule=schedule,
        timeout_ms=45000,
        retry_policy=RetryPolicy(max_retry=3, backoff_sec=[5, 10, 30]),
        inputs={
            "timezone": request.timezone,
            "source": "planner_prompt",
        },
    )

    return PlannerJob(
        reason="Prompt meminta laporan/ringkasan berkala.",
        assumptions=assumptions,
        warnings=warnings,
        job_spec=job_spec,
    )


def _bangun_job_backup(
    text: str,
    request: PlannerRequest,
    used_ids: Set[str],
) -> PlannerJob:
    assumptions: List[str] = []
    warnings: List[str] = []

    cron = _ekstrak_cron_harian(text)
    if cron:
        schedule = Schedule(cron=cron)
        minute, hour, _, _, _ = cron.split(" ")
        schedule_tag = f"harian-{hour.zfill(2)}{minute.zfill(2)}"
    else:
        schedule = Schedule(cron="0 2 * * *")
        schedule_tag = "harian-0200"
        assumptions.append("Waktu backup tidak disebutkan, pakai default 02:00.")

    date_stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    output_path = f"backup-{date_stamp}.json"

    base_id = _buat_slug(f"backup-export-{schedule_tag}")
    job_id = _pastikan_id_job_unik(base_id, used_ids)

    job_spec = JobSpec(
        job_id=job_id,
        type="backup.export",
        schedule=schedule,
        timeout_ms=120000,
        retry_policy=RetryPolicy(max_retry=2, backoff_sec=[10, 30]),
        inputs={
            "output_path": output_path,
            "timezone": request.timezone,
            "source": "planner_prompt",
        },
    )

    return PlannerJob(
        reason="Prompt meminta backup/ekspor data berkala.",
        assumptions=assumptions,
        warnings=warnings,
        job_spec=job_spec,
    )


def _bangun_job_alur_agen(
    request: PlannerRequest,
    used_ids: Set[str],
    fallback_mode: bool = False,
) -> PlannerJob:
    assumptions: List[str] = []
    warnings: List[str] = []

    if fallback_mode:
        assumptions.append("Intent spesifik monitor/laporan/backup tidak terdeteksi. Prompt dialihkan ke agent workflow.")

    base_id = _buat_slug("agent-workflow")
    job_id = _pastikan_id_job_unik(base_id, used_ids)

    job_spec = JobSpec(
        job_id=job_id,
        type="agent.workflow",
        timeout_ms=90000,
        retry_policy=RetryPolicy(max_retry=1, backoff_sec=[2, 5]),
        inputs={
            "prompt": request.prompt.strip(),
            "timezone": request.timezone,
            "default_channel": request.default_channel,
            "default_account_id": request.default_account_id,
            "source": "planner_prompt",
        },
    )

    return PlannerJob(
        reason="Prompt membutuhkan rangkaian aksi lintas provider/MCP.",
        assumptions=assumptions,
        warnings=warnings,
        job_spec=job_spec,
    )


def build_plan_from_prompt(request: PlannerRequest) -> PlannerResponse:
    text = _normalisasi_teks(request.prompt)
    used_ids: Set[str] = set()

    assumptions: List[str] = []
    warnings: List[str] = []
    jobs: List[PlannerJob] = []

    wants_monitor = _memuat_salah_satu(
        text,
        ["monitor", "pantau", "cek", "status", "heartbeat", "koneksi"],
    )
    wants_report = _memuat_salah_satu(
        text,
        ["laporan", "report", "ringkasan", "rekap"],
    )
    wants_backup = _memuat_salah_satu(
        text,
        ["backup", "cadangan", "ekspor", "export"],
    )
    wants_agent_workflow = _memuat_kata_agen(text)

    if wants_monitor:
        jobs.append(_bangun_job_monitor(text, request, used_ids))
    if wants_report:
        jobs.append(_bangun_job_laporan(text, request, used_ids))
    if wants_backup:
        jobs.append(_bangun_job_backup(text, request, used_ids))
    if wants_agent_workflow:
        jobs.append(_bangun_job_alur_agen(request, used_ids))

    if not jobs:
        jobs.append(_bangun_job_alur_agen(request, used_ids, fallback_mode=True))
        warnings.append("Planner memakai mode agent workflow generik karena intent spesifik tidak terdeteksi.")

    for job in jobs:
        assumptions.extend(job.assumptions)
        warnings.extend(job.warnings)

    summary = (
        f"Planner menghasilkan {len(jobs)} rencana tugas."
        if jobs
        else "Planner belum bisa membuat rencana tugas dari prompt ini."
    )

    return PlannerResponse(
        prompt=request.prompt,
        normalized_prompt=text,
        summary=summary,
        planner_source="rule_based",
        assumptions=assumptions,
        warnings=warnings,
        jobs=jobs,
    )
