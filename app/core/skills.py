import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from redis.exceptions import RedisError

from app.core.redis_client import redis_client

SKILLS_SET = "skill:all"
SKILL_PREFIX = "skill:item:"
SKILL_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._:-]{1,64}$")

_fallback_skills: Dict[str, Dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_skill_id(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if not value:
        raise ValueError("skill_id wajib diisi.")
    if not SKILL_ID_PATTERN.match(value):
        raise ValueError("skill_id hanya boleh berisi huruf, angka, titik, garis bawah, titik dua, atau strip.")
    return value


def _skill_key(skill_id: str) -> str:
    return f"{SKILL_PREFIX}{skill_id}"


def _copy_payload(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, dict):
        return dict(payload)
    return {}


def _normalize_list(raw: Any) -> List[str]:
    if isinstance(raw, (list, tuple)):
        return [str(item).strip() for item in raw if str(item).strip()]
    if raw is None:
        return []
    return [str(raw).strip()]


def _sanitize_skill(row: Dict[str, Any]) -> Dict[str, Any]:
    sanitized = dict(row)
    sanitized["command_allow_prefixes"] = _normalize_list(row.get("command_allow_prefixes"))
    sanitized["allowed_channels"] = _normalize_list(row.get("allowed_channels"))
    sanitized["tags"] = _normalize_list(row.get("tags"))
    sanitized["tool_allowlist"] = _normalize_list(row.get("tool_allowlist"))
    sanitized["required_secrets"] = _normalize_list(row.get("required_secrets"))
    sanitized["require_approval"] = bool(row.get("require_approval"))
    sanitized["allow_sensitive_commands"] = bool(row.get("allow_sensitive_commands"))
    sanitized["default_inputs"] = _copy_payload(row.get("default_inputs"))
    
    rate_limit_raw = row.get("rate_limit")
    if isinstance(rate_limit_raw, dict):
        sanitized["rate_limit"] = {
            "max_runs": int(rate_limit_raw.get("max_runs") or 0),
            "window_sec": int(rate_limit_raw.get("window_sec") or 60)
        }
    else:
        sanitized["rate_limit"] = None
        
    return sanitized


async def _get_skill_raw(skill_id: str) -> Optional[Dict[str, Any]]:
    normalized_id = _normalize_skill_id(skill_id)
    try:
        payload = await redis_client.get(_skill_key(normalized_id))
        if not payload:
            return None
        row = json.loads(payload)
        if isinstance(row, dict):
            return row
        return None
    except RedisError:
        row = _fallback_skills.get(normalized_id)
        return dict(row) if row else None


async def _store_skill(normalized_id: str, row: Dict[str, Any]) -> None:
    row["skill_id"] = normalized_id
    try:
        await redis_client.set(_skill_key(normalized_id), json.dumps(row))
        await redis_client.sadd(SKILLS_SET, normalized_id)
    except RedisError:
        _fallback_skills[normalized_id] = dict(row)


async def list_skills(tags: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    try:
        ids = sorted(await redis_client.smembers(SKILLS_SET))
    except RedisError:
        ids = sorted(_fallback_skills.keys())

    rows: List[Dict[str, Any]] = []
    for skill_id in ids:
        try:
            row = await _get_skill_raw(skill_id)
        except ValueError:
            continue
        if not row:
            continue
        sanitized = _sanitize_skill(row)
        if tags:
            row_tags = {tag.lower() for tag in sanitized.get("tags", [])}
            search_tags = {tag.lower() for tag in tags}
            if not search_tags.intersection(row_tags):
                continue
        rows.append(sanitized)

    rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
    return rows


async def get_skill(skill_id: str) -> Optional[Dict[str, Any]]:
    row = await _get_skill_raw(skill_id)
    if not row:
        return None
    return _sanitize_skill(row)


async def upsert_skill(skill_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized_id = _normalize_skill_id(skill_id)
    existing = await _get_skill_raw(normalized_id) or {}

    name = str(payload.get("name", existing.get("name", ""))).strip()
    if not name:
        raise ValueError("nama skill wajib diisi.")

    job_type = str(payload.get("job_type", existing.get("job_type", ""))).strip()
    if not job_type:
        raise ValueError("job_type skill wajib diisi.")

    description = str(payload.get("description", existing.get("description", ""))).strip()
    version = str(payload.get("version", existing.get("version", "1.0.0"))).strip() or "1.0.0"
    runbook = str(payload.get("runbook", existing.get("runbook", ""))).strip()
    source = str(payload.get("source", existing.get("source", ""))).strip()

    default_inputs = _copy_payload(payload.get("default_inputs", existing.get("default_inputs", {})))
    allowed_channels = _normalize_list(payload.get("allowed_channels", existing.get("allowed_channels", [])))
    command_allow_prefixes = _normalize_list(payload.get("command_allow_prefixes", existing.get("command_allow_prefixes", [])))
    tags = _normalize_list(payload.get("tags", existing.get("tags", [])))
    tool_allowlist = _normalize_list(payload.get("tool_allowlist", existing.get("tool_allowlist", [])))
    required_secrets = _normalize_list(payload.get("required_secrets", existing.get("required_secrets", [])))
    
    rate_limit = existing.get("rate_limit")
    if "rate_limit" in payload:
        rate_limit_raw = payload.get("rate_limit")
        if isinstance(rate_limit_raw, dict):
            rate_limit = {
                "max_runs": int(rate_limit_raw.get("max_runs") or 0),
                "window_sec": int(rate_limit_raw.get("window_sec") or 60)
            }
        else:
            rate_limit = None

    now = _now_iso()
    row = {
        "skill_id": normalized_id,
        "name": name,
        "description": description,
        "job_type": job_type,
        "version": version,
        "runbook": runbook,
        "source": source,
        "default_inputs": default_inputs,
        "allowed_channels": allowed_channels,
        "command_allow_prefixes": command_allow_prefixes,
        "tool_allowlist": tool_allowlist,
        "required_secrets": required_secrets,
        "rate_limit": rate_limit,
        "allow_sensitive_commands": bool(payload.get("allow_sensitive_commands", existing.get("allow_sensitive_commands", False))),
        "require_approval": bool(payload.get("require_approval", existing.get("require_approval", False))),
        "tags": tags,
        "created_at": existing.get("created_at", now),
        "updated_at": now,
    }

    await _store_skill(normalized_id, row)
    return _sanitize_skill(row)


async def delete_skill(skill_id: str) -> bool:
    normalized_id = _normalize_skill_id(skill_id)
    removed = False
    try:
        deleted = await redis_client.delete(_skill_key(normalized_id))
        await redis_client.srem(SKILLS_SET, normalized_id)
        removed = bool(deleted)
    except RedisError:
        removed = normalized_id in _fallback_skills
        _fallback_skills.pop(normalized_id, None)

    return removed
