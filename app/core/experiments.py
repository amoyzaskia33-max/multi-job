import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from redis.exceptions import RedisError

from app.core.redis_client import redis_client

EXPERIMENTS_SET = "experiment:all"
EXPERIMENT_PREFIX = "experiment:item:"
EXPERIMENT_MAX_LIMIT = 500
EXPERIMENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._:-]{1,64}$")

_fallback_experiments: Dict[str, Dict[str, Any]] = {}


def _sekarang_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _kunci_experiment(experiment_id: str) -> str:
    return f"{EXPERIMENT_PREFIX}{experiment_id}"


def _normalisasi_experiment_id(raw: str) -> str:
    value = str(raw or "").strip().lower()
    if not value:
        raise ValueError("experiment_id wajib diisi.")
    if not EXPERIMENT_ID_PATTERN.match(value):
        raise ValueError("experiment_id hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, atau strip.")
    return value


def _normalisasi_tags(raw: Any) -> List[str]:
    if isinstance(raw, str):
        sumber = [item.strip() for item in raw.split(",")]
    elif isinstance(raw, list):
        sumber = [str(item).strip() for item in raw]
    else:
        return []

    hasil: List[str] = []
    sudah = set()
    for item in sumber:
        if not item:
            continue
        key = item.lower()
        if key in sudah:
            continue
        sudah.add(key)
        hasil.append(item)
    return hasil


def _normalisasi_split_b(raw: Any, default: int = 50) -> int:
    try:
        value = int(raw)
    except Exception:
        value = default
    return max(0, min(100, value))


def _normalisasi_job_id(raw: Any) -> str:
    return str(raw or "").strip().lower()


def _normalisasi_variant(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value in {"a", "control", "variant_a"}:
        return "a"
    if value in {"b", "treatment", "variant_b"}:
        return "b"
    return ""


def _bucket_traffic(seed: str) -> int:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % 100


def _pilih_variant_dari_split(traffic_split_b: int, seed: str) -> Dict[str, Any]:
    split_b = _normalisasi_split_b(traffic_split_b, default=50)
    if split_b <= 0:
        return {"variant": "a", "bucket": 0}
    if split_b >= 100:
        return {"variant": "b", "bucket": 99}
    bucket = _bucket_traffic(seed)
    return {"variant": "b" if bucket < split_b else "a", "bucket": bucket}


def _payload_tampilan(row: Dict[str, Any]) -> Dict[str, Any]:
    return dict(row)


async def _ambil_experiment_raw(experiment_id: str) -> Optional[Dict[str, Any]]:
    normalized_id = _normalisasi_experiment_id(experiment_id)
    try:
        payload = await redis_client.get(_kunci_experiment(normalized_id))
        if not payload:
            return None
        row = json.loads(payload)
        if isinstance(row, dict):
            return row
        return None
    except RedisError:
        row = _fallback_experiments.get(normalized_id)
        return dict(row) if row else None


async def list_experiments(
    enabled: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(int(limit), EXPERIMENT_MAX_LIMIT))
    token = str(search or "").strip().lower()

    try:
        ids = sorted(await redis_client.smembers(EXPERIMENTS_SET))
    except RedisError:
        ids = sorted(_fallback_experiments.keys())

    rows: List[Dict[str, Any]] = []
    for experiment_id in ids:
        try:
            row = await _ambil_experiment_raw(experiment_id)
        except ValueError:
            continue
        if not row:
            continue
        if enabled is not None and bool(row.get("enabled", False)) != bool(enabled):
            continue
        if token:
            searchable = " ".join(
                [
                    str(row.get("experiment_id") or ""),
                    str(row.get("name") or ""),
                    str(row.get("job_id") or ""),
                    str(row.get("description") or ""),
                    " ".join([str(tag) for tag in row.get("tags", []) if str(tag).strip()]),
                ]
            ).lower()
            if token not in searchable:
                continue
        rows.append(_payload_tampilan(row))

    rows.sort(key=lambda row: str(row.get("updated_at") or ""), reverse=True)
    return rows[:safe_limit]


async def get_experiment(experiment_id: str) -> Optional[Dict[str, Any]]:
    row = await _ambil_experiment_raw(experiment_id)
    if not row:
        return None
    return _payload_tampilan(row)


async def upsert_experiment(experiment_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized_id = _normalisasi_experiment_id(experiment_id)
    data = payload if isinstance(payload, dict) else {}
    existing = await _ambil_experiment_raw(normalized_id) or {}

    name = str(data.get("name", existing.get("name", ""))).strip()
    if not name:
        raise ValueError("name wajib diisi.")

    variant_a_prompt = str(data.get("variant_a_prompt", existing.get("variant_a_prompt", ""))).strip()
    variant_b_prompt = str(data.get("variant_b_prompt", existing.get("variant_b_prompt", ""))).strip()
    if not variant_a_prompt and not variant_b_prompt:
        raise ValueError("Isi minimal salah satu prompt varian.")

    now = _sekarang_iso()
    row = {
        "experiment_id": normalized_id,
        "name": name,
        "description": str(data.get("description", existing.get("description", ""))).strip(),
        "job_id": str(data.get("job_id", existing.get("job_id", ""))).strip(),
        "hypothesis": str(data.get("hypothesis", existing.get("hypothesis", ""))).strip(),
        "variant_a_name": str(data.get("variant_a_name", existing.get("variant_a_name", "control"))).strip()
        or "control",
        "variant_b_name": str(data.get("variant_b_name", existing.get("variant_b_name", "treatment"))).strip()
        or "treatment",
        "variant_a_prompt": variant_a_prompt,
        "variant_b_prompt": variant_b_prompt,
        "traffic_split_b": _normalisasi_split_b(data.get("traffic_split_b", existing.get("traffic_split_b", 50))),
        "enabled": bool(data.get("enabled", existing.get("enabled", False))),
        "tags": _normalisasi_tags(data.get("tags", existing.get("tags", []))),
        "owner": str(data.get("owner", existing.get("owner", ""))).strip(),
        "notes": str(data.get("notes", existing.get("notes", ""))).strip(),
        "created_at": existing.get("created_at", now),
        "updated_at": now,
        "last_variant": str(existing.get("last_variant") or ""),
        "last_variant_name": str(existing.get("last_variant_name") or ""),
        "last_variant_bucket": existing.get("last_variant_bucket"),
        "last_variant_run_at": str(existing.get("last_variant_run_at") or ""),
    }

    try:
        await redis_client.set(_kunci_experiment(normalized_id), json.dumps(row))
        await redis_client.sadd(EXPERIMENTS_SET, normalized_id)
    except RedisError:
        _fallback_experiments[normalized_id] = dict(row)

    return _payload_tampilan(row)


async def set_experiment_enabled(experiment_id: str, enabled: bool) -> Optional[Dict[str, Any]]:
    normalized_id = _normalisasi_experiment_id(experiment_id)
    row = await _ambil_experiment_raw(normalized_id)
    if not row:
        return None

    row["enabled"] = bool(enabled)
    row["updated_at"] = _sekarang_iso()

    try:
        await redis_client.set(_kunci_experiment(normalized_id), json.dumps(row))
        await redis_client.sadd(EXPERIMENTS_SET, normalized_id)
    except RedisError:
        _fallback_experiments[normalized_id] = dict(row)

    return _payload_tampilan(row)


async def delete_experiment(experiment_id: str) -> bool:
    normalized_id = _normalisasi_experiment_id(experiment_id)

    removed = False
    try:
        deleted = await redis_client.delete(_kunci_experiment(normalized_id))
        await redis_client.srem(EXPERIMENTS_SET, normalized_id)
        removed = bool(deleted)
    except RedisError:
        removed = normalized_id in _fallback_experiments
        _fallback_experiments.pop(normalized_id, None)

    return removed


async def record_experiment_variant_run(
    experiment_id: str,
    variant: str,
    variant_name: str,
    job_id: str,
    run_id: str,
    bucket: Optional[int] = None,
) -> None:
    normalized_id = _normalisasi_experiment_id(experiment_id)
    try:
        row = await _ambil_experiment_raw(normalized_id)
    except ValueError:
        return

    if not row:
        return

    now = _sekarang_iso()
    row["last_variant"] = _normalisasi_variant(variant) or row.get("last_variant") or "a"
    row["last_variant_name"] = str(variant_name or row.get("last_variant_name") or "").strip()
    row["last_variant_bucket"] = bucket
    row["last_variant_run_at"] = now
    row["updated_at"] = now

    try:
        await redis_client.set(_kunci_experiment(normalized_id), json.dumps(row))
        await redis_client.sadd(EXPERIMENTS_SET, normalized_id)
    except RedisError:
        _fallback_experiments[normalized_id] = dict(row)


async def resolve_experiment_prompt_for_job(
    job_id: str,
    *,
    run_id: str = "",
    base_prompt: str = "",
    experiment_id: str = "",
    preferred_variant: str = "",
) -> Dict[str, Any]:
    normalized_job_id = _normalisasi_job_id(job_id)
    normalized_experiment_id = str(experiment_id or "").strip().lower()
    normalized_preferred_variant = _normalisasi_variant(preferred_variant)
    base_prompt_clean = str(base_prompt or "").strip()

    result: Dict[str, Any] = {
        "applied": False,
        "reason": "no_matching_experiment",
        "job_id": normalized_job_id,
        "experiment_id": normalized_experiment_id,
        "variant": "",
        "variant_name": "",
        "traffic_split_b": 0,
        "bucket": None,
        "prompt": base_prompt_clean,
    }

    row: Optional[Dict[str, Any]] = None
    if normalized_experiment_id:
        try:
            row = await get_experiment(normalized_experiment_id)
        except ValueError:
            result["reason"] = "invalid_experiment_id"
            return result

        if not row:
            result["reason"] = "experiment_not_found"
            return result
        if not bool(row.get("enabled", False)):
            result["reason"] = "experiment_disabled"
            return result

        experiment_job_id = _normalisasi_job_id(row.get("job_id"))
        if normalized_job_id and experiment_job_id and experiment_job_id != normalized_job_id:
            result["reason"] = "experiment_job_mismatch"
            return result
    else:
        if not normalized_job_id:
            result["reason"] = "job_id_required"
            return result

        candidates = await list_experiments(enabled=True, limit=EXPERIMENT_MAX_LIMIT)
        for candidate in candidates:
            if _normalisasi_job_id(candidate.get("job_id")) == normalized_job_id:
                row = candidate
                break

        if not row:
            result["reason"] = "no_matching_experiment"
            return result

    normalized_experiment_id = str(row.get("experiment_id") or "").strip().lower()
    traffic_split_b = _normalisasi_split_b(row.get("traffic_split_b", 50), default=50)

    result["experiment_id"] = normalized_experiment_id
    result["traffic_split_b"] = traffic_split_b

    chosen_variant = normalized_preferred_variant
    if not chosen_variant:
        seed = "|".join(
            [
                normalized_experiment_id,
                str(run_id or "").strip(),
                normalized_job_id,
                base_prompt_clean[:120],
            ]
        )
        split_choice = _pilih_variant_dari_split(traffic_split_b, seed)
        chosen_variant = str(split_choice.get("variant") or "a")
        result["bucket"] = split_choice.get("bucket")

    prompt_a = str(row.get("variant_a_prompt") or "").strip()
    prompt_b = str(row.get("variant_b_prompt") or "").strip()

    effective_variant = chosen_variant if chosen_variant == "b" else "a"
    if effective_variant == "a" and not prompt_a and prompt_b:
        effective_variant = "b"
    elif effective_variant == "b" and not prompt_b and prompt_a:
        effective_variant = "a"

    selected_prompt = prompt_b if effective_variant == "b" else prompt_a
    if not selected_prompt:
        result["variant"] = effective_variant
        result["variant_name"] = str(
            row.get("variant_b_name" if effective_variant == "b" else "variant_a_name")
            or ("treatment" if effective_variant == "b" else "control")
        ).strip()
        result["reason"] = "experiment_prompt_empty"
        return result

    result["applied"] = True
    result["variant"] = effective_variant
    result["variant_name"] = str(
        row.get("variant_b_name" if effective_variant == "b" else "variant_a_name")
        or ("treatment" if effective_variant == "b" else "control")
    ).strip()
    result["prompt"] = selected_prompt
    if normalized_preferred_variant:
        result["reason"] = (
            "forced_variant"
            if effective_variant == normalized_preferred_variant
            else "forced_variant_prompt_fallback"
        )
    else:
        result["reason"] = "traffic_split"

    return result
