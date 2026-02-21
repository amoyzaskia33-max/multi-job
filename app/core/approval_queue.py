import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from redis.exceptions import RedisError

from .redis_client import redis_client

APPROVAL_PREFIX = "approval:req:"
APPROVAL_ORDER_KEY = "approval:req:order"
APPROVAL_RUN_INDEX_PREFIX = "approval:req:run:"
APPROVAL_MAX = 500
VALID_STATUS = {"pending", "approved", "rejected"}

_fallback_rows: Dict[str, Dict[str, Any]] = {}
_fallback_order: List[str] = []
_fallback_run_index: Dict[str, str] = {}


def _sekarang_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _salin(value: Any) -> Any:
    return json.loads(json.dumps(value))


def _normalisasi_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    cleaned = status.strip().lower()
    if cleaned in VALID_STATUS:
        return cleaned
    raise ValueError("status approval tidak valid.")


def _buat_id_approval() -> str:
    return f"apr_{int(time.time())}_{uuid.uuid4().hex[:8]}"


def _kunci_approval(approval_id: str) -> str:
    return f"{APPROVAL_PREFIX}{approval_id}"


def _kunci_run(run_id: str) -> str:
    return f"{APPROVAL_RUN_INDEX_PREFIX}{run_id}"


def _bersih_requests(rows: Any) -> List[Dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    hasil: List[Dict[str, Any]] = []
    for item in rows:
        if isinstance(item, dict):
            hasil.append(_salin(item))
    return hasil


def _bersih_dict(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return _salin(raw)
    return {}


def _bersih_list(raw: Any) -> List[Any]:
    if isinstance(raw, list):
        return _salin(raw)
    return []


async def _ambil_approval_raw(approval_id: str) -> Optional[Dict[str, Any]]:
    key = _kunci_approval(approval_id)
    try:
        payload = await redis_client.get(key)
        if payload:
            row = json.loads(payload)
            if isinstance(row, dict):
                return row
    except RedisError:
        pass
    except Exception:
        return None

    row = _fallback_rows.get(approval_id)
    if not row:
        return None
    return _salin(row)


async def create_approval_request(
    *,
    run_id: str,
    job_id: str,
    job_type: str,
    prompt: str,
    summary: str,
    approval_requests: List[Dict[str, Any]],
    available_providers: Optional[Dict[str, Any]] = None,
    available_mcp_servers: Optional[List[Any]] = None,
    source: str = "agent.workflow",
) -> Tuple[Dict[str, Any], bool]:
    normalized_run_id = run_id.strip()
    normalized_job_id = job_id.strip()
    normalized_job_type = job_type.strip()

    if not normalized_run_id:
        raise ValueError("run_id wajib diisi.")
    if not normalized_job_id:
        raise ValueError("job_id wajib diisi.")
    if not normalized_job_type:
        raise ValueError("job_type wajib diisi.")

    # Dedup by run_id: one run creates at most one approval request.
    existing_id: Optional[str] = None
    try:
        existing_id = await redis_client.get(_kunci_run(normalized_run_id))
    except RedisError:
        existing_id = _fallback_run_index.get(normalized_run_id)

    if existing_id:
        existing_row = await _ambil_approval_raw(existing_id)
        if existing_row:
            return existing_row, False

    approval_id = _buat_id_approval()
    now = _sekarang_iso()
    requests = _bersih_requests(approval_requests)

    row = {
        "approval_id": approval_id,
        "status": "pending",
        "source": source.strip() or "agent.workflow",
        "run_id": normalized_run_id,
        "job_id": normalized_job_id,
        "job_type": normalized_job_type,
        "prompt": prompt.strip(),
        "summary": summary.strip(),
        "request_count": len(requests),
        "approval_requests": requests,
        "available_providers": _bersih_dict(available_providers),
        "available_mcp_servers": _bersih_list(available_mcp_servers),
        "created_at": now,
        "updated_at": now,
        "decided_at": None,
        "decision_by": None,
        "decision_note": None,
    }

    try:
        await redis_client.set(_kunci_approval(approval_id), json.dumps(row))
        await redis_client.set(_kunci_run(normalized_run_id), approval_id)
        await redis_client.lpush(APPROVAL_ORDER_KEY, approval_id)
        await redis_client.ltrim(APPROVAL_ORDER_KEY, 0, APPROVAL_MAX - 1)
    except RedisError:
        _fallback_rows[approval_id] = _salin(row)
        _fallback_run_index[normalized_run_id] = approval_id
        _fallback_order.insert(0, approval_id)
        del _fallback_order[APPROVAL_MAX:]

    return row, True


async def get_approval_request(approval_id: str) -> Optional[Dict[str, Any]]:
    normalized_id = approval_id.strip()
    if not normalized_id:
        return None
    return await _ambil_approval_raw(normalized_id)


async def list_approval_requests(status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    normalized_status = _normalisasi_status(status)
    safe_limit = max(1, min(int(limit), APPROVAL_MAX))

    ids: List[str] = []
    try:
        ids = await redis_client.lrange(APPROVAL_ORDER_KEY, 0, safe_limit * 5)
    except RedisError:
        ids = list(_fallback_order[: safe_limit * 5])

    rows: List[Dict[str, Any]] = []
    for approval_id in ids:
        row = await _ambil_approval_raw(approval_id)
        if not row:
            continue
        if normalized_status and str(row.get("status") or "").strip().lower() != normalized_status:
            continue
        rows.append(row)
        if len(rows) >= safe_limit:
            break
    return rows


async def decide_approval_request(
    approval_id: str,
    *,
    status: str,
    decision_by: Optional[str] = None,
    decision_note: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    normalized_status = _normalisasi_status(status)
    if normalized_status not in {"approved", "rejected"}:
        raise ValueError("status keputusan harus approved atau rejected.")

    row = await _ambil_approval_raw(approval_id.strip())
    if not row:
        return None

    now = _sekarang_iso()
    row["status"] = normalized_status
    row["updated_at"] = now
    row["decided_at"] = now
    row["decision_by"] = (decision_by or "").strip() or None
    row["decision_note"] = (decision_note or "").strip() or None

    key_id = str(row.get("approval_id") or approval_id).strip()
    run_id = str(row.get("run_id") or "").strip()

    try:
        await redis_client.set(_kunci_approval(key_id), json.dumps(row))
        if run_id:
            await redis_client.set(_kunci_run(run_id), key_id)
    except RedisError:
        _fallback_rows[key_id] = _salin(row)
        if run_id:
            _fallback_run_index[run_id] = key_id

    return _salin(row)
