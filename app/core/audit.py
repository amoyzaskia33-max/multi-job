from typing import Any, Dict, Optional


MUTATING_METHODS = {"POST", "PUT", "DELETE", "PATCH"}
AUDIT_EVENT_TYPE = "audit.action"


def is_mutating_method(method: str) -> bool:
    return str(method or "").strip().upper() in MUTATING_METHODS


def audit_outcome_from_status(status_code: int) -> str:
    try:
        code = int(status_code)
    except Exception:
        return "error"
    if code in {401, 403}:
        return "denied"
    if 200 <= code < 400:
        return "success"
    return "error"


def _potong_teks(value: Any, limit: int = 240) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def build_audit_payload(
    *,
    method: str,
    path: str,
    status_code: int,
    required_role: str,
    auth_ctx: Optional[Dict[str, Any]] = None,
    query: str = "",
    detail: str = "",
    client_ip: str = "",
) -> Dict[str, Any]:
    context = auth_ctx if isinstance(auth_ctx, dict) else {}
    role = str(context.get("role") or "unknown").strip().lower() or "unknown"
    subject = str(context.get("subject") or "anonymous").strip() or "anonymous"
    enabled = bool(context.get("enabled", False))

    return {
        "method": str(method or "").strip().upper(),
        "path": str(path or "").strip(),
        "status_code": int(status_code),
        "outcome": audit_outcome_from_status(status_code),
        "required_role": str(required_role or "").strip().lower(),
        "actor_role": role,
        "actor_subject": _potong_teks(subject, limit=80),
        "auth_enabled": enabled,
        "query": _potong_teks(query, limit=300),
        "detail": _potong_teks(detail, limit=300),
        "client_ip": _potong_teks(client_ip, limit=80),
    }


def event_to_audit_row(event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(event, dict):
        return None
    if str(event.get("type") or "").strip() != AUDIT_EVENT_TYPE:
        return None
    data = event.get("data")
    if not isinstance(data, dict):
        return None

    return {
        "id": str(event.get("id") or "").strip(),
        "timestamp": str(event.get("timestamp") or "").strip(),
        "method": str(data.get("method") or "").strip().upper(),
        "path": str(data.get("path") or "").strip(),
        "status_code": int(data.get("status_code") or 0),
        "outcome": str(data.get("outcome") or "").strip().lower(),
        "required_role": str(data.get("required_role") or "").strip().lower(),
        "actor_role": str(data.get("actor_role") or "").strip().lower(),
        "actor_subject": str(data.get("actor_subject") or "").strip(),
        "auth_enabled": bool(data.get("auth_enabled", False)),
        "query": str(data.get("query") or "").strip(),
        "detail": str(data.get("detail") or "").strip(),
        "client_ip": str(data.get("client_ip") or "").strip(),
    }
