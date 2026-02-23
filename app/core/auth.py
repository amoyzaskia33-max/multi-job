import os
from dataclasses import dataclass
from typing import Dict, Optional


ROLE_VIEWER = "viewer"
ROLE_OPERATOR = "operator"
ROLE_ADMIN = "admin"

ROLE_PRIORITY = {
    ROLE_VIEWER: 1,
    ROLE_OPERATOR: 2,
    ROLE_ADMIN: 3,
}


@dataclass
class AuthConfig:
    enabled: bool
    token_roles: Dict[str, str]
    header_name: str
    scheme: str


def _parse_bool(raw: Optional[str], default: bool = False) -> bool:
    if raw is None:
        return default
    value = str(raw).strip().lower()
    if value in {"1", "true", "yes", "y", "on"}:
        return True
    if value in {"0", "false", "no", "n", "off"}:
        return False
    return default


def normalisasi_role(raw: Optional[str]) -> str:
    value = str(raw or "").strip().lower()
    if value in ROLE_PRIORITY:
        return value
    return ROLE_VIEWER


def role_memenuhi(minimum_role: str, actual_role: str) -> bool:
    min_level = ROLE_PRIORITY.get(normalisasi_role(minimum_role), ROLE_PRIORITY[ROLE_VIEWER])
    actual_level = ROLE_PRIORITY.get(normalisasi_role(actual_role), ROLE_PRIORITY[ROLE_VIEWER])
    return actual_level >= min_level


def parse_token_roles_from_env() -> Dict[str, str]:
    hasil: Dict[str, str] = {}

    mapping = {
        os.getenv("AUTH_VIEWER_TOKEN", "").strip(): ROLE_VIEWER,
        os.getenv("AUTH_OPERATOR_TOKEN", "").strip(): ROLE_OPERATOR,
        os.getenv("AUTH_ADMIN_TOKEN", "").strip(): ROLE_ADMIN,
    }
    for token, role in mapping.items():
        if token:
            hasil[token] = role

    raw_pairs = str(os.getenv("AUTH_API_KEYS", "")).strip()
    if raw_pairs:
        for item in raw_pairs.split(","):
            pasangan = item.strip()
            if not pasangan:
                continue
            if ":" not in pasangan:
                continue
            token, role = pasangan.split(":", 1)
            token_clean = token.strip()
            role_clean = normalisasi_role(role)
            if token_clean:
                hasil[token_clean] = role_clean

    return hasil


def load_auth_config() -> AuthConfig:
    enabled = _parse_bool(os.getenv("AUTH_ENABLED"), default=False)
    header_name = str(os.getenv("AUTH_TOKEN_HEADER", "Authorization")).strip() or "Authorization"
    scheme = str(os.getenv("AUTH_TOKEN_SCHEME", "Bearer")).strip() or "Bearer"
    token_roles = parse_token_roles_from_env()
    return AuthConfig(enabled=enabled, token_roles=token_roles, header_name=header_name, scheme=scheme)


def extract_auth_token(headers: Dict[str, str], header_name: str, scheme: str) -> str:
    # FastAPI/Starlette headers are case-insensitive. Dict access in tests may not be.
    value = ""
    target_key = header_name.lower()
    source_key = target_key
    for key, raw_value in headers.items():
        if str(key).lower() == target_key:
            value = str(raw_value or "").strip()
            break

    if not value and target_key != "x-api-key":
        for key, raw_value in headers.items():
            if str(key).lower() == "x-api-key":
                value = str(raw_value or "").strip()
                source_key = "x-api-key"
                break

    if not value:
        return ""

    if source_key == "authorization":
        scheme_clean = str(scheme or "").strip()
        if not scheme_clean:
            return value
        prefix = f"{scheme_clean} "
        if value.lower().startswith(prefix.lower()):
            return value[len(prefix) :].strip()
        return ""

    return value


def resolve_required_role(path: str, method: str) -> str:
    clean_path = str(path or "").strip().lower()
    clean_method = str(method or "GET").strip().upper()

    if clean_path in {"/healthz", "/readyz", "/metrics"}:
        return ""

    # High-risk endpoints: only admin can mutate security/integration controls.
    if clean_method in {"POST", "PUT", "DELETE"}:
        if clean_path.startswith("/jobs/") and "/rollback/" in clean_path:
            return ROLE_ADMIN
        if clean_path.startswith("/approvals/") and (
            clean_path.endswith("/approve") or clean_path.endswith("/reject")
        ):
            return ROLE_ADMIN
        if clean_path.startswith("/integrations/accounts/"):
            return ROLE_ADMIN
        if clean_path.startswith("/integrations/mcp/servers/"):
            return ROLE_ADMIN
        if clean_path == "/integrations/catalog/bootstrap":
            return ROLE_ADMIN
        if clean_path.startswith("/agents/memory/"):
            return ROLE_ADMIN
        return ROLE_OPERATOR

    # Default for read-only endpoints.
    return ROLE_VIEWER
