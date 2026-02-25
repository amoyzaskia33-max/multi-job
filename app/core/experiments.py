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
