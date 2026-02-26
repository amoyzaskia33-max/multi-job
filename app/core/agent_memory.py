import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from redis.exceptions import RedisError

from app.core.redis_client import redis_client

AGENT_MEMORY_SET = "agent:memory:all"
AGENT_MEMORY_PREFIX = "agent:memory:"

_fallback_agent_memory: Dict[str, Dict[str, Any]] = {}


def _sekarang_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _salin(value: Any) -> Any:
    return json.loads(json.dumps(value))


def _normalisasi_agent_key(agent_key: str) -> str:
    cleaned = str(agent_key or "").strip().lower()
    if not cleaned:
        return "agent:umum"
    return cleaned[:128]


def _kunci(agent_key: str) -> str:
    return f"{AGENT_MEMORY_PREFIX}{agent_key}"


def _memori_default(agent_key: str) -> Dict[str, Any]:
    now = _sekarang_iso()
    return {
        "agent_key": agent_key,
        "total_runs": 0,
        "success_runs": 0,
        "failed_runs": 0,
        "last_prompt": "",
        "last_summary": "",
        "last_error": None,
        "last_final_message": "",
        "failure_signatures": {},
        "avoid_signatures": [],
        "run_history": [],
        "recent_failures": [],
        "recent_successes": [],
        "episodic_events": [],
        "tags": [],
        "updated_at": now,
    }


def _trim_list(rows: List[Any], max_items: int) -> List[Any]:
    if len(rows) <= max_items:
        return rows
    return rows[:max_items]


def _ringkas_text(raw: Any, limit: int = 220) -> str:
    text = str(raw or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def _signature_from_step_result(step_result: Dict[str, Any]) -> str:
    kind = str(step_result.get("kind") or "").strip().lower()
    if not kind:
        return ""

    if kind == "provider_http":
        provider = str(step_result.get("provider") or "").strip().lower()
        method = str(step_result.get("method") or "GET").strip().upper()
        url = str(step_result.get("url") or "").strip().lower()
        path = urlparse(url).path if url else ""
        return f"provider_http:{provider}:{method}:{path}"

    if kind == "mcp_http":
        server_id = str(step_result.get("server_id") or "").strip().lower()
        method = str(step_result.get("method") or "GET").strip().upper()
        url = str(step_result.get("url") or "").strip().lower()
        path = urlparse(url).path if url else ""
        return f"mcp_http:{server_id}:{method}:{path}"

    if kind == "local_command":
        command = " ".join(str(step_result.get("command") or "").strip().lower().split())
        return f"local_command:{command[:120]}"

    return ""


def _failure_signatures_sorted(mapping: Dict[str, Any]) -> List[str]:
    rows: List[tuple[str, int]] = []
    for key, value in mapping.items():
        try:
            score = int(value)
        except Exception:
            score = 0
        if score > 0:
            rows.append((str(key), score))
    rows.sort(key=lambda item: item[1], reverse=True)
    return [item[0] for item in rows]


async def get_agent_memory(agent_key: str) -> Dict[str, Any]:
    normalized = _normalisasi_agent_key(agent_key)
    key = _kunci(normalized)

    try:
        payload = await redis_client.get(key)
        if payload:
            row = json.loads(payload)
            if isinstance(row, dict):
                row.setdefault("agent_key", normalized)
                return row
    except RedisError:
        fallback = _fallback_agent_memory.get(normalized)
        if fallback:
            return _salin(fallback)
    except Exception:
        pass

    fallback = _fallback_agent_memory.get(normalized)
    if fallback:
        return _salin(fallback)
    return _memori_default(normalized)


async def _save_agent_memory(agent_key: str, memory: Dict[str, Any]) -> None:
    normalized = _normalisasi_agent_key(agent_key)
    payload = dict(memory)
    payload["agent_key"] = normalized
    payload["updated_at"] = _sekarang_iso()

    try:
        await redis_client.set(_kunci(normalized), json.dumps(payload))
        await redis_client.sadd(AGENT_MEMORY_SET, normalized)
        _fallback_agent_memory[normalized] = _salin(payload)
        return
    except RedisError:
        _fallback_agent_memory[normalized] = _salin(payload)
    except Exception:
        _fallback_agent_memory[normalized] = _salin(payload)


async def list_agent_memories(limit: int = 100) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(500, int(limit)))

    keys: List[str] = []
    try:
        keys = sorted(await redis_client.smembers(AGENT_MEMORY_SET))
    except RedisError:
        keys = sorted(_fallback_agent_memory.keys())
    except Exception:
        keys = sorted(_fallback_agent_memory.keys())

    rows: List[Dict[str, Any]] = []
    for agent_key in keys[:safe_limit]:
        row = await get_agent_memory(agent_key)
        rows.append(row)

    rows.sort(key=lambda item: str(item.get("updated_at") or ""), reverse=True)
    return rows[:safe_limit]


async def delete_agent_memory(agent_key: str) -> bool:
    normalized = _normalisasi_agent_key(agent_key)
    deleted = False

    try:
        raw_deleted = await redis_client.delete(_kunci(normalized))
        if isinstance(raw_deleted, int):
            deleted = raw_deleted > 0
        await redis_client.srem(AGENT_MEMORY_SET, normalized)
    except RedisError:
        pass
    except Exception:
        pass

    if normalized in _fallback_agent_memory:
        _fallback_agent_memory.pop(normalized, None)
        deleted = True

    return deleted


def build_agent_memory_context(memory: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    row = memory if isinstance(memory, dict) else {}

    try:
        total_runs = int(row.get("total_runs") or 0)
    except Exception:
        total_runs = 0
    try:
        success_runs = int(row.get("success_runs") or 0)
    except Exception:
        success_runs = 0

    success_rate = 0.0
    if total_runs > 0:
        success_rate = round((success_runs / total_runs) * 100.0, 2)

    failure_signatures = row.get("failure_signatures") if isinstance(row.get("failure_signatures"), dict) else {}
    ordered_signatures = _failure_signatures_sorted(failure_signatures)

    avoid_signatures = [str(item).strip() for item in row.get("avoid_signatures", []) if str(item).strip()]
    if not avoid_signatures:
        avoid_signatures = [item for item in ordered_signatures if int(failure_signatures.get(item, 0)) >= 2]

    recent_failures_raw = row.get("recent_failures") if isinstance(row.get("recent_failures"), list) else []
    recent_failures: List[Dict[str, Any]] = []
    for item in recent_failures_raw[:6]:
        if not isinstance(item, dict):
            continue
        recent_failures.append(
            {
                "at": str(item.get("at") or ""),
                "signature": str(item.get("signature") or ""),
                "error": _ringkas_text(item.get("error"), 180),
            }
        )

    return {
        "agent_key": str(row.get("agent_key") or ""),
        "total_runs": total_runs,
        "success_runs": success_runs,
        "failed_runs": int(row.get("failed_runs") or 0),
        "success_rate": success_rate,
        "last_error": _ringkas_text(row.get("last_error"), 180),
        "last_summary": _ringkas_text(row.get("last_summary"), 220),
        "avoid_signatures": avoid_signatures[:12],
        "top_failure_signatures": ordered_signatures[:12],
        "recent_failures": recent_failures,
        "episodic_events": row.get("episodic_events") if isinstance(row.get("episodic_events"), list) else [],
        "tags": row.get("tags") if isinstance(row.get("tags"), list) else [],
        "updated_at": str(row.get("updated_at") or ""),
    }


async def record_agent_workflow_outcome(
    *,
    agent_key: str,
    prompt: str,
    success: bool,
    summary: str,
    final_message: str,
    step_results: Optional[List[Dict[str, Any]]] = None,
    error: Optional[str] = None,
) -> Dict[str, Any]:
    normalized = _normalisasi_agent_key(agent_key)
    memory = await get_agent_memory(normalized)

    total_runs = int(memory.get("total_runs") or 0) + 1
    success_runs = int(memory.get("success_runs") or 0)
    failed_runs = int(memory.get("failed_runs") or 0)

    if success:
        success_runs += 1
    else:
        failed_runs += 1

    failure_signatures = memory.get("failure_signatures")
    if not isinstance(failure_signatures, dict):
        failure_signatures = {}

    history = memory.get("run_history")
    if not isinstance(history, list):
        history = []

    recent_failures = memory.get("recent_failures")
    if not isinstance(recent_failures, list):
        recent_failures = []

    recent_successes = memory.get("recent_successes")
    if not isinstance(recent_successes, list):
        recent_successes = []

    now = _sekarang_iso()
    steps = step_results if isinstance(step_results, list) else []
    for step in steps:
        if not isinstance(step, dict):
            continue
        signature = _signature_from_step_result(step)
        if not signature:
            continue

        step_ok = bool(step.get("success", False))
        if step_ok:
            previous_score = int(failure_signatures.get(signature, 0) or 0)
            if previous_score > 0:
                next_score = previous_score - 1
                if next_score <= 0:
                    failure_signatures.pop(signature, None)
                else:
                    failure_signatures[signature] = next_score
        else:
            failure_signatures[signature] = int(failure_signatures.get(signature, 0) or 0) + 1
            recent_failures.insert(
                0,
                {
                    "at": now,
                    "signature": signature,
                    "error": _ringkas_text(step.get("error") or step.get("stderr_preview") or "Langkah gagal", 220),
                },
            )

    if not success:
        fallback_signature = "run_error:workflow"
        failure_signatures[fallback_signature] = int(failure_signatures.get(fallback_signature, 0) or 0) + 1
        recent_failures.insert(
            0,
            {
                "at": now,
                "signature": fallback_signature,
                "error": _ringkas_text(error or "Workflow gagal", 220),
            },
        )
    else:
        recent_successes.insert(
            0,
            {
                "at": now,
                "summary": _ringkas_text(summary, 220),
                "final_message": _ringkas_text(final_message, 180),
            },
        )

    avoid_signatures = [signature for signature in _failure_signatures_sorted(failure_signatures) if int(failure_signatures.get(signature, 0)) >= 2]

    history.insert(
        0,
        {
            "at": now,
            "success": bool(success),
            "prompt": _ringkas_text(prompt, 220),
            "summary": _ringkas_text(summary, 220),
            "error": _ringkas_text(error, 220) if error else "",
        },
    )

    episodic_events = memory.get("episodic_events")
    if not isinstance(episodic_events, list):
        episodic_events = []
    
    # Store significant outcomes as episodic memory
    episodic_events.insert(0, {
        "timestamp": now,
        "type": "workflow_run",
        "description": f"Workflow {'succeeded' if success else 'failed'}: {_ringkas_text(summary, 100)}",
        "context": {
            "success": success,
            "error": _ringkas_text(error, 100) if error else None
        }
    })

    memory["agent_key"] = normalized
    memory["total_runs"] = total_runs
    memory["success_runs"] = success_runs
    memory["failed_runs"] = failed_runs
    memory["last_prompt"] = _ringkas_text(prompt, 300)
    memory["last_summary"] = _ringkas_text(summary, 300)
    memory["last_error"] = _ringkas_text(error, 300) if error else None
    memory["last_final_message"] = _ringkas_text(final_message, 300)
    memory["failure_signatures"] = {key: int(value) for key, value in failure_signatures.items() if int(value) > 0}
    memory["avoid_signatures"] = _trim_list(avoid_signatures, 20)
    memory["run_history"] = _trim_list(history, 30)
    memory["recent_failures"] = _trim_list(recent_failures, 20)
    memory["recent_successes"] = _trim_list(recent_successes, 20)
    memory["episodic_events"] = _trim_list(episodic_events, 50)
    memory["tags"] = memory.get("tags") if isinstance(memory.get("tags"), list) else []
    memory["updated_at"] = now

    await _save_agent_memory(normalized, memory)
    return memory
