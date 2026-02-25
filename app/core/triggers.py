import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from redis.exceptions import RedisError

from app.core.approval_queue import create_approval_request
from app.core.models import QueueEvent
from app.core.queue import append_event, enqueue_job, get_job_spec
from app.core.redis_client import redis_client

TRIGGERS_SET = "trigger:all"
TRIGGER_PREFIX = "trigger:item:"
TRIGGER_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._:-]{1,64}$")

_fallback_triggers: Dict[str, Dict[str, Any]] = {}


def _sekarang_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_trigger_id(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if not value:
        raise ValueError("trigger_id wajib diisi.")
    if not TRIGGER_ID_PATTERN.match(value):
        raise ValueError("trigger_id hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, atau strip.")
    return value


def _trigger_key(trigger_id: str) -> str:
    return f"{TRIGGER_PREFIX}{trigger_id}"


def _copy_payload(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def _sanitize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    sanitized = dict(row)
    secret = sanitized.pop("secret", None)
    sanitized["secret_present"] = bool(secret)
    return sanitized


def _verify_secret(stored: Optional[str], provided: Optional[str]) -> None:
    if not stored:
        return
    if not provided:
        raise ValueError("Auth token tidak valid.")
    if stored != provided:
        raise ValueError("Auth token tidak valid.")


async def _ambil_trigger_raw(trigger_id: str) -> Optional[Dict[str, Any]]:
    normalized_id = _normalize_trigger_id(trigger_id)
    try:
        payload = await redis_client.get(_trigger_key(normalized_id))
        if not payload:
            return None
        row = json.loads(payload)
        if isinstance(row, dict):
            return row
        return None
    except RedisError:
        row = _fallback_triggers.get(normalized_id)
        return dict(row) if row else None


def _payload_tampilan(row: Dict[str, Any]) -> Dict[str, Any]:
    return _sanitize_row(row)


async def _simpan_trigger(normalized_id: str, row: Dict[str, Any]) -> None:
    row["trigger_id"] = normalized_id
    try:
        await redis_client.set(_trigger_key(normalized_id), json.dumps(row))
        await redis_client.sadd(TRIGGERS_SET, normalized_id)
    except RedisError:
        _fallback_triggers[normalized_id] = dict(row)


async def list_triggers(enabled: Optional[bool] = None) -> List[Dict[str, Any]]:
    try:
        ids = sorted(await redis_client.smembers(TRIGGERS_SET))
    except RedisError:
        ids = sorted(_fallback_triggers.keys())

    rows: List[Dict[str, Any]] = []
    for trigger_id in ids:
        try:
            row = await _ambil_trigger_raw(trigger_id)
        except ValueError:
            continue
        if not row:
            continue
        if enabled is not None and bool(row.get("enabled", True)) != bool(enabled):
            continue
        rows.append(_payload_tampilan(row))

    rows.sort(key=lambda row: str(row.get("updated_at") or ""), reverse=True)
    return rows


async def get_trigger(trigger_id: str) -> Optional[Dict[str, Any]]:
    row = await _ambil_trigger_raw(trigger_id)
    if not row:
        return None
    return _payload_tampilan(row)


async def upsert_trigger(trigger_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized_id = _normalize_trigger_id(trigger_id)
    existing = await _ambil_trigger_raw(normalized_id) or {}

    name = str(payload.get("name", existing.get("name", ""))).strip()
    if not name:
        raise ValueError("nama trigger wajib diisi.")

    job_id = str(payload.get("job_id", existing.get("job_id", ""))).strip()
    if not job_id:
        raise ValueError("job_id target wajib diisi.")

    channel = str(payload.get("channel", existing.get("channel", ""))).strip().lower()
    if not channel:
        raise ValueError("channel trigger wajib diisi.")

    description = str(payload.get("description", existing.get("description", ""))).strip()
    default_payload = _copy_payload(payload.get("default_payload", existing.get("default_payload", {})))
    secret = str(payload.get("secret", existing.get("secret", "")) or "").strip()

    now = _sekarang_iso()
    row = {
        "trigger_id": normalized_id,
        "name": name,
        "job_id": job_id,
        "channel": channel,
        "description": description,
        "enabled": bool(payload.get("enabled", existing.get("enabled", True))),
        "default_payload": default_payload,
        "secret": secret,
        "requires_approval": bool(payload.get("requires_approval", existing.get("requires_approval", False))),
        "created_at": existing.get("created_at", now),
        "updated_at": now,
        "last_fired_run_id": existing.get("last_fired_run_id"),
        "last_fired_at": existing.get("last_fired_at"),
    }

    await _simpan_trigger(normalized_id, row)
    return _payload_tampilan(row)


async def delete_trigger(trigger_id: str) -> bool:
    normalized_id = _normalize_trigger_id(trigger_id)
    removed = False
    try:
        deleted = await redis_client.delete(_trigger_key(normalized_id))
        await redis_client.srem(TRIGGERS_SET, normalized_id)
        removed = bool(deleted)
    except RedisError:
        removed = normalized_id in _fallback_triggers
        _fallback_triggers.pop(normalized_id, None)

    return removed


async def fire_trigger(
    trigger_id: str,
    *,
    payload: Optional[Dict[str, Any]] = None,
    source: str = "api.trigger",
    auth_token: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_id = _normalize_trigger_id(trigger_id)
    row = await _ambil_trigger_raw(normalized_id)
    if not row:
        raise ValueError("Trigger tidak ditemukan.")
    if not bool(row.get("enabled", True)):
        raise ValueError("Trigger tidak aktif.")

    _verify_secret(str(row.get("secret") or ""), auth_token)

    job_spec = await get_job_spec(str(row.get("job_id") or ""))
    if not job_spec:
        raise ValueError("Job target tidak ditemukan.")

    inputs: Dict[str, Any] = dict(job_spec.get("inputs") or {})
    default_payload = _copy_payload(row.get("default_payload"))
    user_payload = _copy_payload(payload)
    channel_inputs = {"channel": row["channel"], "trigger_id": trigger_id, "trigger_source": source}

    merged_inputs = {**inputs, **default_payload, **user_payload, **channel_inputs}

    run_id = f"trigger_{trigger_id}_{uuid.uuid4().hex[:8]}"
    timeout_ms = int(job_spec.get("timeout_ms", 30000))
    event = QueueEvent(
        run_id=run_id,
        job_id=str(job_spec.get("job_id") or ""),
        type=str(job_spec.get("type") or ""),
        inputs=merged_inputs,
        attempt=0,
        scheduled_at=_sekarang_iso(),
        timeout_ms=timeout_ms,
        trace_id=f"trigger:{trigger_id}:{uuid.uuid4().hex}",
    )

    now = _sekarang_iso()
    row["last_fired_run_id"] = run_id
    row["last_fired_at"] = now
    row["updated_at"] = now

    if row.get("requires_approval") and str(source).startswith("connector"):
        approval_requests = [
            {
                "kind": "trigger",
                "trigger_id": trigger_id,
                "channel": row["channel"],
                "payload": merged_inputs,
                "reason": "requires_trigger_approval",
                "action_hint": "Periksa payload dan setujui sebelum executing job.",
            }
        ]
        approval, _ = await create_approval_request(
            run_id=run_id,
            job_id=str(job_spec.get("job_id") or ""),
            job_type=str(job_spec.get("type") or ""),
            prompt=f"Trigger {trigger_id} via {source}",
            summary=f"Trigger {row.get('name') or trigger_id} ({row['channel']}) meminta approval.",
            approval_requests=approval_requests,
            source=source,
        )
        await _simpan_trigger(normalized_id, row)
        await append_event(
            "trigger.approval_requested",
            {
                "trigger_id": trigger_id,
                "job_id": row["job_id"],
                "channel": row["channel"],
                "source": source,
                "run_id": run_id,
                "approval_id": approval.get("approval_id"),
            },
        )
        return {
            "requires_approval": True,
            "approval_id": approval.get("approval_id"),
            "trigger_id": trigger_id,
            "job_id": row["job_id"],
            "channel": row["channel"],
        }

    message_id = await enqueue_job(event)

    await _simpan_trigger(normalized_id, row)
    await append_event(
        "trigger.fired",
        {
            "trigger_id": trigger_id,
            "job_id": row["job_id"],
            "channel": row["channel"],
            "source": source,
            "run_id": run_id,
            "message_id": message_id,
        },
    )

    return {"message_id": message_id, "run_id": run_id, "job_id": row["job_id"], "channel": row["channel"]}
