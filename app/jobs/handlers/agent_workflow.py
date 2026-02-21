import json
import os
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import aiohttp

from app.core.integration_configs import list_integration_accounts, list_mcp_servers

OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
MAX_STEPS = 5
PREVIEW_LIMIT = 500

DEFAULT_PROVIDER_BASE_URLS: Dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "github": "https://api.github.com",
    "notion": "https://api.notion.com/v1",
    "linear": "https://api.linear.app/graphql",
}


def _normalize_model_id(model_id: str) -> str:
    cleaned = model_id.strip()
    if cleaned.startswith("openai/"):
        cleaned = cleaned.split("/", 1)[1].strip()
    return cleaned or DEFAULT_OPENAI_MODEL


def _extract_json_object(raw_text: str) -> Optional[Dict[str, Any]]:
    text = raw_text.strip()
    if not text:
        return None

    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None

    try:
        payload = json.loads(text[start : end + 1])
    except Exception:
        return None

    return payload if isinstance(payload, dict) else None


def _to_string_map(raw: Any) -> Dict[str, str]:
    if not isinstance(raw, dict):
        return {}

    output: Dict[str, str] = {}
    for key, value in raw.items():
        name = str(key).strip()
        if not name:
            continue
        output[name] = str(value)
    return output


def _sanitize_plan(raw: Dict[str, Any]) -> Dict[str, Any]:
    summary = str(raw.get("summary") or "Agent workflow plan generated.").strip()
    final_message = str(raw.get("final_message") or "").strip()
    raw_steps = raw.get("steps", [])
    if not isinstance(raw_steps, list):
        raw_steps = []

    steps: List[Dict[str, Any]] = []
    for row in raw_steps:
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "").strip().lower()
        if kind == "note":
            text = str(row.get("text") or "").strip()
            if text:
                steps.append({"kind": "note", "text": text})
        elif kind == "provider_http":
            provider = str(row.get("provider") or "").strip().lower()
            if not provider:
                continue
            step = {
                "kind": "provider_http",
                "provider": provider,
                "account_id": str(row.get("account_id") or "default").strip() or "default",
                "method": str(row.get("method") or "GET").strip().upper(),
                "path": str(row.get("path") or "").strip(),
                "headers": _to_string_map(row.get("headers", {})),
                "body": row.get("body"),
            }
            steps.append(step)
        elif kind == "mcp_http":
            server_id = str(row.get("server_id") or "").strip()
            if not server_id:
                continue
            step = {
                "kind": "mcp_http",
                "server_id": server_id,
                "method": str(row.get("method") or "GET").strip().upper(),
                "path": str(row.get("path") or "").strip(),
                "headers": _to_string_map(row.get("headers", {})),
                "body": row.get("body"),
            }
            steps.append(step)

        if len(steps) >= MAX_STEPS:
            break

    if not steps:
        steps = [{"kind": "note", "text": "Planner AI tidak memberi langkah aksi yang valid."}]

    return {
        "summary": summary,
        "final_message": final_message,
        "steps": steps,
    }


def _shorten_text(raw: Any, limit: int = PREVIEW_LIMIT) -> str:
    if raw is None:
        return ""
    text = str(raw).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def _resolve_provider_base_url(provider: str, account: Dict[str, Any]) -> str:
    config = account.get("config", {})
    if not isinstance(config, dict):
        config = {}
    base_url = str(config.get("base_url") or "").strip()
    if base_url:
        return base_url
    return DEFAULT_PROVIDER_BASE_URLS.get(provider, "")


def _resolve_url(base_url: str, path: str) -> str:
    cleaned_path = path.strip()
    if cleaned_path.startswith("http://") or cleaned_path.startswith("https://"):
        return cleaned_path
    if not base_url:
        return ""
    if not cleaned_path:
        return base_url
    return urljoin(base_url.rstrip("/") + "/", cleaned_path.lstrip("/"))


def _inject_provider_auth(
    headers: Dict[str, str],
    provider: str,
    secret: str,
    config: Dict[str, Any],
) -> Dict[str, str]:
    output = dict(headers)

    if secret and "Authorization" not in output:
        output["Authorization"] = f"Bearer {secret}"

    if provider == "github":
        output.setdefault("Accept", "application/vnd.github+json")
    elif provider == "notion":
        version = str(config.get("notion_version") or "2022-06-28").strip()
        output.setdefault("Notion-Version", version)

    return output


def _catalog_accounts(rows: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        if not row.get("enabled", True):
            continue
        provider = str(row.get("provider") or "").strip().lower()
        if not provider:
            continue
        grouped.setdefault(provider, []).append(row)
    return grouped


def _select_account(
    grouped: Dict[str, List[Dict[str, Any]]],
    provider: str,
    account_id: str,
) -> Optional[Dict[str, Any]]:
    rows = grouped.get(provider, [])
    if not rows:
        return None

    for row in rows:
        if str(row.get("account_id") or "") == account_id:
            return row

    for row in rows:
        if str(row.get("account_id") or "") == "default":
            return row

    return rows[0]


def _catalog_mcp(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    output: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        if not row.get("enabled", True):
            continue
        server_id = str(row.get("server_id") or "").strip()
        if server_id:
            output[server_id] = row
    return output


def _build_planner_system_prompt(
    provider_catalog: Dict[str, List[Dict[str, Any]]],
    mcp_catalog: Dict[str, Dict[str, Any]],
) -> str:
    provider_lines: List[str] = []
    for provider, rows in sorted(provider_catalog.items()):
        account_ids = ", ".join(sorted({str(row.get("account_id") or "default") for row in rows}))
        provider_lines.append(f"- {provider}: accounts [{account_ids}]")
    if not provider_lines:
        provider_lines = ["- (none)"]

    mcp_lines: List[str] = []
    for server_id, row in sorted(mcp_catalog.items()):
        transport = str(row.get("transport") or "stdio")
        endpoint = str(row.get("url") or row.get("command") or "-")
        mcp_lines.append(f"- {server_id}: {transport} ({endpoint})")
    if not mcp_lines:
        mcp_lines = ["- (none)"]

    return (
        "You are an integration workflow planner.\n"
        "Return ONLY valid JSON object with this schema:\n"
        "{\n"
        '  "summary": "string",\n'
        '  "final_message": "string",\n'
        '  "steps": [\n'
        "    note step:\n"
        '      {"kind":"note","text":"string"}\n'
        "    provider HTTP step:\n"
        '      {"kind":"provider_http","provider":"github","account_id":"default","method":"GET","path":"/user","headers":{},"body":null}\n'
        "    mcp HTTP step:\n"
        '      {"kind":"mcp_http","server_id":"mcp_main","method":"GET","path":"/health","headers":{},"body":null}\n'
        "  ]\n"
        "}\n"
        "Rules:\n"
        "1) Maximum 5 steps.\n"
        "2) Use only providers and MCP servers from catalog below.\n"
        "3) Prefer provider_http/mcp_http steps when actionable.\n"
        "4) If action is unclear, provide a single note step.\n\n"
        "Providers:\n"
        + "\n".join(provider_lines)
        + "\n\nMCP servers:\n"
        + "\n".join(mcp_lines)
    )


async def _plan_actions_with_openai(
    prompt: str,
    model_id: str,
    api_key: str,
    provider_catalog: Dict[str, List[Dict[str, Any]]],
    mcp_catalog: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    payload = {
        "model": model_id,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _build_planner_system_prompt(provider_catalog, mcp_catalog)},
            {"role": "user", "content": prompt},
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(OPENAI_CHAT_COMPLETIONS_URL, json=payload, headers=headers) as response:
            response_text = await response.text()
            if response.status >= 400:
                raise RuntimeError(f"OpenAI planner failed ({response.status}): {_shorten_text(response_text, 220)}")

    try:
        data = json.loads(response_text)
    except Exception as exc:
        raise RuntimeError(f"OpenAI planner response is not JSON: {exc}") from exc

    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise RuntimeError("OpenAI planner response has no choices.")

    message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
    content = message.get("content", "")
    if isinstance(content, list):
        content = "\n".join(
            str(item.get("text", "") if isinstance(item, dict) else item)
            for item in content
        )

    parsed = _extract_json_object(str(content))
    if not parsed:
        raise RuntimeError("OpenAI planner did not return valid JSON plan.")
    return parsed


def _step_success_from_http_result(result: Dict[str, Any]) -> bool:
    if not bool(result.get("success", False)):
        return False
    status_raw = result.get("status")
    try:
        status_code = int(status_raw)
    except Exception:
        return True
    return 200 <= status_code < 400


async def _execute_provider_http_step(
    ctx,
    step: Dict[str, Any],
    provider_catalog: Dict[str, List[Dict[str, Any]]],
    http_tool,
) -> Dict[str, Any]:
    provider = str(step.get("provider") or "").strip().lower()
    account_id = str(step.get("account_id") or "default").strip() or "default"
    account = _select_account(provider_catalog, provider, account_id)
    if not account:
        return {
            "kind": "provider_http",
            "provider": provider,
            "account_id": account_id,
            "success": False,
            "error": "Provider/account not found or disabled.",
        }

    config = account.get("config", {}) if isinstance(account.get("config", {}), dict) else {}
    base_url = _resolve_provider_base_url(provider, account)
    url = _resolve_url(base_url, str(step.get("path") or ""))
    if not url:
        return {
            "kind": "provider_http",
            "provider": provider,
            "account_id": account_id,
            "success": False,
            "error": "Cannot resolve URL. Add base_url in integration config or use absolute URL path.",
        }

    headers = _to_string_map(config.get("headers", {}))
    headers.update(_to_string_map(step.get("headers", {})))
    secret = str(account.get("secret") or "").strip()
    headers = _inject_provider_auth(headers, provider, secret, config)

    timeout_raw = config.get("timeout_sec", 30)
    try:
        timeout = max(5, min(120, int(timeout_raw)))
    except Exception:
        timeout = 30

    request_payload = {
        "method": str(step.get("method") or "GET").upper(),
        "url": url,
        "headers": headers,
        "body": step.get("body"),
        "timeout": timeout,
    }
    result = await http_tool.run(request_payload, ctx)

    return {
        "kind": "provider_http",
        "provider": provider,
        "account_id": str(account.get("account_id") or account_id),
        "method": request_payload["method"],
        "url": url,
        "status": result.get("status"),
        "success": _step_success_from_http_result(result),
        "response_preview": _shorten_text(result.get("body")),
        "error": result.get("error"),
    }


async def _execute_mcp_http_step(
    ctx,
    step: Dict[str, Any],
    mcp_catalog: Dict[str, Dict[str, Any]],
    http_tool,
) -> Dict[str, Any]:
    server_id = str(step.get("server_id") or "").strip()
    server = mcp_catalog.get(server_id)
    if not server:
        return {
            "kind": "mcp_http",
            "server_id": server_id,
            "success": False,
            "error": "MCP server not found or disabled.",
        }

    transport = str(server.get("transport") or "").strip().lower()
    if transport not in {"http", "sse"}:
        return {
            "kind": "mcp_http",
            "server_id": server_id,
            "success": False,
            "error": f"MCP server transport '{transport}' is not HTTP-callable.",
        }

    base_url = str(server.get("url") or "").strip()
    url = _resolve_url(base_url, str(step.get("path") or ""))
    if not url:
        return {
            "kind": "mcp_http",
            "server_id": server_id,
            "success": False,
            "error": "Cannot resolve MCP URL.",
        }

    headers = _to_string_map(server.get("headers", {}))
    headers.update(_to_string_map(step.get("headers", {})))
    auth_token = str(server.get("auth_token") or "").strip()
    if auth_token and "Authorization" not in headers:
        headers["Authorization"] = f"Bearer {auth_token}"

    timeout_raw = server.get("timeout_sec", 20)
    try:
        timeout = max(1, min(120, int(timeout_raw)))
    except Exception:
        timeout = 20

    request_payload = {
        "method": str(step.get("method") or "GET").upper(),
        "url": url,
        "headers": headers,
        "body": step.get("body"),
        "timeout": timeout,
    }
    result = await http_tool.run(request_payload, ctx)

    return {
        "kind": "mcp_http",
        "server_id": server_id,
        "transport": transport,
        "method": request_payload["method"],
        "url": url,
        "status": result.get("status"),
        "success": _step_success_from_http_result(result),
        "response_preview": _shorten_text(result.get("body")),
        "error": result.get("error"),
    }


async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    prompt = str(inputs.get("prompt") or "").strip()
    if not prompt:
        return {"success": False, "error": "prompt is required"}

    http_tool = ctx.tools.get("http")
    if not http_tool:
        return {"success": False, "error": "http tool is not available"}

    integration_rows = await list_integration_accounts(include_secret=True)
    mcp_rows = await list_mcp_servers(include_secret=True)

    provider_catalog = _catalog_accounts(integration_rows)
    mcp_catalog = _catalog_mcp(mcp_rows)

    preferred_openai_account = str(inputs.get("openai_account_id") or "default").strip() or "default"
    openai_account = _select_account(provider_catalog, "openai", preferred_openai_account)

    openai_api_key = ""
    openai_model_id = str(inputs.get("model_id") or "").strip()
    if openai_account:
        openai_api_key = str(openai_account.get("secret") or "").strip()
        if not openai_model_id:
            config = openai_account.get("config", {})
            if isinstance(config, dict):
                openai_model_id = str(config.get("model_id") or "").strip()

    if not openai_api_key:
        openai_api_key = str(os.getenv("OPENAI_API_KEY") or "").strip()

    if not openai_api_key:
        return {
            "success": False,
            "error": "OpenAI API key belum tersedia. Isi provider 'openai' di dashboard atau set OPENAI_API_KEY.",
        }

    model_id = _normalize_model_id(
        openai_model_id or str(os.getenv("PLANNER_AI_MODEL") or DEFAULT_OPENAI_MODEL)
    )

    try:
        raw_plan = await _plan_actions_with_openai(
            prompt=prompt,
            model_id=model_id,
            api_key=openai_api_key,
            provider_catalog=provider_catalog,
            mcp_catalog=mcp_catalog,
        )
        plan = _sanitize_plan(raw_plan)
    except Exception as exc:
        return {"success": False, "error": f"Agent planner gagal: {exc}"}

    step_results: List[Dict[str, Any]] = []
    for step in plan["steps"]:
        kind = step.get("kind")
        if kind == "note":
            step_results.append({"kind": "note", "success": True, "text": str(step.get("text") or "")})
            continue

        if kind == "provider_http":
            result = await _execute_provider_http_step(ctx, step, provider_catalog, http_tool)
            step_results.append(result)
            continue

        if kind == "mcp_http":
            result = await _execute_mcp_http_step(ctx, step, mcp_catalog, http_tool)
            step_results.append(result)
            continue

    actionable = [row for row in step_results if row.get("kind") in {"provider_http", "mcp_http"}]
    overall_success = all(bool(row.get("success")) for row in actionable) if actionable else True

    available_providers = {
        provider: sorted({str(row.get("account_id") or "default") for row in rows})
        for provider, rows in provider_catalog.items()
    }
    available_mcp_servers = sorted(mcp_catalog.keys())

    return {
        "success": overall_success,
        "summary": plan["summary"],
        "final_message": plan.get("final_message") or "",
        "model_id": model_id,
        "prompt": prompt,
        "steps_planned": len(plan["steps"]),
        "steps_executed": len(step_results),
        "step_results": step_results,
        "available_providers": available_providers,
        "available_mcp_servers": available_mcp_servers,
    }
