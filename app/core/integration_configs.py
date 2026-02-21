import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from redis.exceptions import RedisError

from app.core.redis_client import redis_client

MCP_SERVERS_SET = "integration:mcp:servers"
MCP_SERVER_PREFIX = "integration:mcp:server:"

INTEGRATION_ACCOUNTS_SET = "integration:accounts"
INTEGRATION_ACCOUNT_PREFIX = "integration:account:"

_fallback_mcp_servers: Dict[str, Dict[str, Any]] = {}
_fallback_integration_accounts: Dict[str, Dict[str, Any]] = {}


def _sekarang_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _kunci_mcp(server_id: str) -> str:
    return f"{MCP_SERVER_PREFIX}{server_id}"


def _kunci_akun(provider: str, account_id: str) -> str:
    return f"{INTEGRATION_ACCOUNT_PREFIX}{provider}:{account_id}"


def _masking_rahasia(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


def _normalisasi_peta_string(raw: Any) -> Dict[str, str]:
    if not isinstance(raw, dict):
        return {}

    output: Dict[str, str] = {}
    for key, value in raw.items():
        name = str(key).strip()
        if not name:
            continue
        output[name] = str(value)
    return output


def _normalisasi_daftar_string(raw: Any) -> List[str]:
    if not isinstance(raw, list):
        return []

    output: List[str] = []
    for item in raw:
        value = str(item).strip()
        if value:
            output.append(value)
    return output


def _tampilan_server_mcp(row: Dict[str, Any], include_secret: bool = False) -> Dict[str, Any]:
    payload = dict(row)

    token = str(payload.get("auth_token") or "").strip()
    payload["has_auth_token"] = bool(token)
    payload["auth_token_masked"] = _masking_rahasia(token) if token else None
    if not include_secret:
        payload.pop("auth_token", None)

    return payload


def _tampilan_akun_integrasi(row: Dict[str, Any], include_secret: bool = False) -> Dict[str, Any]:
    payload = dict(row)

    secret = str(payload.get("secret") or "").strip()
    payload["has_secret"] = bool(secret)
    payload["secret_masked"] = _masking_rahasia(secret) if secret else None
    if not include_secret:
        payload.pop("secret", None)

    return payload


async def _ambil_server_mcp_raw(server_id: str) -> Optional[Dict[str, Any]]:
    try:
        payload = await redis_client.get(_kunci_mcp(server_id))
        if not payload:
            return None
        return json.loads(payload)
    except RedisError:
        row = _fallback_mcp_servers.get(server_id)
        return dict(row) if row else None


async def list_mcp_servers(include_secret: bool = False) -> List[Dict[str, Any]]:
    try:
        ids = sorted(await redis_client.smembers(MCP_SERVERS_SET))
    except RedisError:
        ids = sorted(_fallback_mcp_servers.keys())

    rows: List[Dict[str, Any]] = []
    for server_id in ids:
        row = await _ambil_server_mcp_raw(server_id)
        if row:
            rows.append(_tampilan_server_mcp(row, include_secret=include_secret))
    return rows


async def get_mcp_server(server_id: str, include_secret: bool = False) -> Optional[Dict[str, Any]]:
    row = await _ambil_server_mcp_raw(server_id)
    if not row:
        return None
    return _tampilan_server_mcp(row, include_secret=include_secret)


async def upsert_mcp_server(server_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    existing = await _ambil_server_mcp_raw(server_id) or {}

    transport = str(payload.get("transport", existing.get("transport", "stdio"))).strip().lower()
    if transport not in {"stdio", "http", "sse"}:
        raise ValueError("transport harus salah satu: stdio, http, atau sse.")

    command = str(payload.get("command", existing.get("command", ""))).strip()
    url = str(payload.get("url", existing.get("url", ""))).strip()

    if transport == "stdio" and not command:
        raise ValueError("command wajib diisi untuk transport stdio.")
    if transport in {"http", "sse"} and not url:
        raise ValueError("url wajib diisi untuk transport http/sse.")

    timeout_raw = payload.get("timeout_sec", existing.get("timeout_sec", 20))
    try:
        timeout_sec = int(timeout_raw)
    except Exception:
        timeout_sec = 20
    timeout_sec = max(1, min(120, timeout_sec))

    auth_input = str(payload.get("auth_token") or "").strip()
    auth_token = auth_input or existing.get("auth_token", "")

    now = _sekarang_iso()
    row = {
        "server_id": server_id,
        "enabled": bool(payload.get("enabled", existing.get("enabled", True))),
        "transport": transport,
        "description": str(payload.get("description", existing.get("description", ""))).strip(),
        "command": command,
        "args": _normalisasi_daftar_string(payload.get("args", existing.get("args", []))),
        "url": url,
        "headers": _normalisasi_peta_string(payload.get("headers", existing.get("headers", {}))),
        "env": _normalisasi_peta_string(payload.get("env", existing.get("env", {}))),
        "auth_token": auth_token,
        "timeout_sec": timeout_sec,
        "created_at": existing.get("created_at", now),
        "updated_at": now,
    }

    try:
        await redis_client.set(_kunci_mcp(server_id), json.dumps(row))
        await redis_client.sadd(MCP_SERVERS_SET, server_id)
    except RedisError:
        _fallback_mcp_servers[server_id] = dict(row)

    return _tampilan_server_mcp(row, include_secret=False)


async def delete_mcp_server(server_id: str) -> bool:
    removed = False
    try:
        deleted = await redis_client.delete(_kunci_mcp(server_id))
        await redis_client.srem(MCP_SERVERS_SET, server_id)
        removed = bool(deleted)
    except RedisError:
        removed = server_id in _fallback_mcp_servers
        _fallback_mcp_servers.pop(server_id, None)
    return removed


def _normalisasi_provider(provider: str) -> str:
    cleaned = provider.strip().lower()
    if not cleaned:
        raise ValueError("provider wajib diisi.")
    return cleaned


async def _ambil_akun_integrasi_raw(provider: str, account_id: str) -> Optional[Dict[str, Any]]:
    key = _kunci_akun(provider, account_id)
    try:
        payload = await redis_client.get(key)
        if not payload:
            return None
        return json.loads(payload)
    except RedisError:
        row = _fallback_integration_accounts.get(f"{provider}:{account_id}")
        return dict(row) if row else None


async def list_integration_accounts(provider: Optional[str] = None, include_secret: bool = False) -> List[Dict[str, Any]]:
    normalized_provider = _normalisasi_provider(provider) if provider else None

    try:
        keys = sorted(await redis_client.smembers(INTEGRATION_ACCOUNTS_SET))
    except RedisError:
        keys = sorted(_fallback_integration_accounts.keys())

    rows: List[Dict[str, Any]] = []
    for key in keys:
        provider_name, _, account_id = key.partition(":")
        if not provider_name or not account_id:
            continue
        if normalized_provider and provider_name != normalized_provider:
            continue
        row = await _ambil_akun_integrasi_raw(provider_name, account_id)
        if row:
            rows.append(_tampilan_akun_integrasi(row, include_secret=include_secret))
    return rows


async def get_integration_account(provider: str, account_id: str, include_secret: bool = False) -> Optional[Dict[str, Any]]:
    normalized_provider = _normalisasi_provider(provider)
    normalized_account_id = account_id.strip()
    if not normalized_account_id:
        raise ValueError("account_id wajib diisi.")

    row = await _ambil_akun_integrasi_raw(normalized_provider, normalized_account_id)
    if not row:
        return None
    return _tampilan_akun_integrasi(row, include_secret=include_secret)


async def upsert_integration_account(provider: str, account_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized_provider = _normalisasi_provider(provider)
    normalized_account_id = account_id.strip()
    if not normalized_account_id:
        raise ValueError("account_id wajib diisi.")

    existing = await _ambil_akun_integrasi_raw(normalized_provider, normalized_account_id) or {}
    secret_input = str(payload.get("secret") or "").strip()
    secret = secret_input or existing.get("secret", "")

    now = _sekarang_iso()
    row = {
        "provider": normalized_provider,
        "account_id": normalized_account_id,
        "enabled": bool(payload.get("enabled", existing.get("enabled", True))),
        "secret": secret,
        "config": dict(payload.get("config", existing.get("config", {}))) if isinstance(payload.get("config", existing.get("config", {})), dict) else {},
        "created_at": existing.get("created_at", now),
        "updated_at": now,
    }

    key_id = f"{normalized_provider}:{normalized_account_id}"
    try:
        await redis_client.set(_kunci_akun(normalized_provider, normalized_account_id), json.dumps(row))
        await redis_client.sadd(INTEGRATION_ACCOUNTS_SET, key_id)
    except RedisError:
        _fallback_integration_accounts[key_id] = dict(row)

    return _tampilan_akun_integrasi(row, include_secret=False)


async def delete_integration_account(provider: str, account_id: str) -> bool:
    normalized_provider = _normalisasi_provider(provider)
    normalized_account_id = account_id.strip()
    if not normalized_account_id:
        raise ValueError("account_id wajib diisi.")

    key_id = f"{normalized_provider}:{normalized_account_id}"
    removed = False
    try:
        deleted = await redis_client.delete(_kunci_akun(normalized_provider, normalized_account_id))
        await redis_client.srem(INTEGRATION_ACCOUNTS_SET, key_id)
        removed = bool(deleted)
    except RedisError:
        removed = key_id in _fallback_integration_accounts
        _fallback_integration_accounts.pop(key_id, None)

    return removed
