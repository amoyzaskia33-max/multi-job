import json
import os
from contextlib import suppress
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import aiohttp

from app.core.integration_configs import list_integration_accounts, list_mcp_servers
from app.core.queue import append_event

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


def _normalisasi_id_model(model_id: str) -> str:
    cleaned = model_id.strip()
    if cleaned.startswith("openai/"):
        cleaned = cleaned.split("/", 1)[1].strip()
    return cleaned or DEFAULT_OPENAI_MODEL


def _ekstrak_objek_json(raw_text: str) -> Optional[Dict[str, Any]]:
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


def _ke_peta_string(raw: Any) -> Dict[str, str]:
    if not isinstance(raw, dict):
        return {}

    output: Dict[str, str] = {}
    for key, value in raw.items():
        name = str(key).strip()
        if not name:
            continue
        output[name] = str(value)
    return output


def _sanitasi_rencana(raw: Dict[str, Any]) -> Dict[str, Any]:
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
                "headers": _ke_peta_string(row.get("headers", {})),
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
                "headers": _ke_peta_string(row.get("headers", {})),
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


def _ringkas_teks(raw: Any, limit: int = PREVIEW_LIMIT) -> str:
    if raw is None:
        return ""
    text = str(raw).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def _tentukan_url_dasar_provider(provider: str, account: Dict[str, Any]) -> str:
    config = account.get("config", {})
    if not isinstance(config, dict):
        config = {}
    base_url = str(config.get("base_url") or "").strip()
    if base_url:
        return base_url
    return DEFAULT_PROVIDER_BASE_URLS.get(provider, "")


def _tentukan_url(base_url: str, path: str) -> str:
    cleaned_path = path.strip()
    if cleaned_path.startswith("http://") or cleaned_path.startswith("https://"):
        return cleaned_path
    if not base_url:
        return ""
    if not cleaned_path:
        return base_url
    return urljoin(base_url.rstrip("/") + "/", cleaned_path.lstrip("/"))


def _sisipkan_auth_provider(
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


def _katalog_akun(rows: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        if not row.get("enabled", True):
            continue
        provider = str(row.get("provider") or "").strip().lower()
        if not provider:
            continue
        grouped.setdefault(provider, []).append(row)
    return grouped


def _pilih_akun(
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


def _katalog_mcp(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    output: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        if not row.get("enabled", True):
            continue
        server_id = str(row.get("server_id") or "").strip()
        if server_id:
            output[server_id] = row
    return output


def _buat_request_izin(
    *,
    kind: str,
    reason: str,
    provider: Optional[str] = None,
    account_id: Optional[str] = None,
    server_id: Optional[str] = None,
    action_hint: str = "",
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "kind": kind,
        "reason": reason.strip(),
        "action_hint": action_hint.strip(),
    }
    if provider:
        payload["provider"] = provider.strip().lower()
    if account_id:
        payload["account_id"] = account_id.strip()
    if server_id:
        payload["server_id"] = server_id.strip()
    return payload


def _hapus_duplikat_request_izin(requests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    output: List[Dict[str, Any]] = []
    for item in requests:
        signature = json.dumps(
            {
                "kind": item.get("kind"),
                "provider": item.get("provider"),
                "account_id": item.get("account_id"),
                "server_id": item.get("server_id"),
                "reason": item.get("reason"),
            },
            sort_keys=True,
        )
        if signature in seen:
            continue
        seen.add(signature)
        output.append(item)
    return output


def _kumpulkan_request_izin_dari_rencana(
    steps: List[Dict[str, Any]],
    provider_catalog: Dict[str, List[Dict[str, Any]]],
    mcp_catalog: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    requests: List[Dict[str, Any]] = []

    for step in steps:
        kind = str(step.get("kind") or "").strip().lower()

        if kind == "provider_http":
            provider = str(step.get("provider") or "").strip().lower()
            account_id = str(step.get("account_id") or "default").strip() or "default"
            if not provider:
                continue
            selected = _pilih_akun(provider_catalog, provider, account_id)
            if not selected:
                requests.append(
                    _buat_request_izin(
                        kind="provider_account",
                        provider=provider,
                        account_id=account_id,
                        reason=f"Provider '{provider}' akun '{account_id}' belum tersedia atau belum aktif.",
                        action_hint="Tambahkan akun integrasi di Setelan > Akun Integrasi.",
                    )
                )

        if kind == "mcp_http":
            server_id = str(step.get("server_id") or "").strip()
            if not server_id:
                continue
            server = mcp_catalog.get(server_id)
            if not server:
                requests.append(
                    _buat_request_izin(
                        kind="mcp_server",
                        server_id=server_id,
                        reason=f"MCP server '{server_id}' belum tersedia atau belum aktif.",
                        action_hint="Tambahkan MCP server di Setelan > MCP Servers.",
                    )
                )
                continue

            transport = str(server.get("transport") or "").strip().lower()
            if transport not in {"http", "sse"}:
                requests.append(
                    _buat_request_izin(
                        kind="mcp_transport",
                        server_id=server_id,
                        reason=f"MCP server '{server_id}' belum bisa HTTP call karena transport '{transport}'.",
                        action_hint="Ubah transport MCP ke http/sse untuk dipakai workflow agent.",
                    )
                )

    return _hapus_duplikat_request_izin(requests)


def _buat_respons_butuh_izin(
    *,
    prompt: str,
    summary: str,
    model_id: str,
    approval_requests: List[Dict[str, Any]],
    provider_catalog: Dict[str, List[Dict[str, Any]]],
    mcp_catalog: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    provider_tersedia = {
        provider: sorted({str(row.get("account_id") or "default") for row in rows})
        for provider, rows in provider_catalog.items()
    }
    server_mcp_tersedia = sorted(mcp_catalog.keys())
    pesan = "Butuh izin untuk menambah puzzle/skill yang belum tersedia."

    return {
        "success": False,
        "requires_approval": True,
        "error": pesan,
        "summary": summary,
        "final_message": "",
        "model_id": model_id,
        "prompt": prompt,
        "steps_planned": 0,
        "steps_executed": 0,
        "step_results": [],
        "approval_requests": approval_requests,
        "available_providers": provider_tersedia,
        "available_mcp_servers": server_mcp_tersedia,
    }


def _bangun_prompt_sistem_planner(
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


async def _rencanakan_aksi_dengan_openai(
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
            {"role": "system", "content": _bangun_prompt_sistem_planner(provider_catalog, mcp_catalog)},
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
                raise RuntimeError(f"OpenAI planner failed ({response.status}): {_ringkas_teks(response_text, 220)}")

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

    parsed = _ekstrak_objek_json(str(content))
    if not parsed:
        raise RuntimeError("OpenAI planner did not return valid JSON plan.")
    return parsed


def _langkah_sukses_dari_hasil_http(result: Dict[str, Any]) -> bool:
    if not bool(result.get("success", False)):
        return False
    status_raw = result.get("status")
    try:
        status_code = int(status_raw)
    except Exception:
        return True
    return 200 <= status_code < 400


async def _eksekusi_langkah_provider_http(
    ctx,
    step: Dict[str, Any],
    provider_catalog: Dict[str, List[Dict[str, Any]]],
    http_tool,
) -> Dict[str, Any]:
    provider = str(step.get("provider") or "").strip().lower()
    account_id = str(step.get("account_id") or "default").strip() or "default"
    account = _pilih_akun(provider_catalog, provider, account_id)
    if not account:
        return {
            "kind": "provider_http",
            "provider": provider,
            "account_id": account_id,
            "success": False,
            "error": "Provider/account not found or disabled.",
        }

    config = account.get("config", {}) if isinstance(account.get("config", {}), dict) else {}
    base_url = _tentukan_url_dasar_provider(provider, account)
    url = _tentukan_url(base_url, str(step.get("path") or ""))
    if not url:
        return {
            "kind": "provider_http",
            "provider": provider,
            "account_id": account_id,
            "success": False,
            "error": "Cannot resolve URL. Add base_url in integration config or use absolute URL path.",
        }

    headers = _ke_peta_string(config.get("headers", {}))
    headers.update(_ke_peta_string(step.get("headers", {})))
    secret = str(account.get("secret") or "").strip()
    headers = _sisipkan_auth_provider(headers, provider, secret, config)

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
        "success": _langkah_sukses_dari_hasil_http(result),
        "response_preview": _ringkas_teks(result.get("body")),
        "error": result.get("error"),
    }


async def _eksekusi_langkah_mcp_http(
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
    url = _tentukan_url(base_url, str(step.get("path") or ""))
    if not url:
        return {
            "kind": "mcp_http",
            "server_id": server_id,
            "success": False,
            "error": "Cannot resolve MCP URL.",
        }

    headers = _ke_peta_string(server.get("headers", {}))
    headers.update(_ke_peta_string(step.get("headers", {})))
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
        "success": _langkah_sukses_dari_hasil_http(result),
        "response_preview": _ringkas_teks(result.get("body")),
        "error": result.get("error"),
    }


async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    prompt_pengguna = str(inputs.get("prompt") or "").strip()
    if not prompt_pengguna:
        return {"success": False, "error": "prompt is required"}

    alat_http = ctx.tools.get("http")
    if not alat_http:
        return {"success": False, "error": "http tool is not available"}

    daftar_integrasi = await list_integration_accounts(include_secret=True)
    daftar_mcp = await list_mcp_servers(include_secret=True)

    katalog_provider = _katalog_akun(daftar_integrasi)
    katalog_mcp = _katalog_mcp(daftar_mcp)

    akun_openai_pilihan = str(inputs.get("openai_account_id") or "default").strip() or "default"
    akun_openai = _pilih_akun(katalog_provider, "openai", akun_openai_pilihan)
    perlu_izin_saat_kurang = bool(inputs.get("require_approval_for_missing", True))

    kunci_api_openai = ""
    id_model_openai = str(inputs.get("model_id") or "").strip()
    if akun_openai:
        kunci_api_openai = str(akun_openai.get("secret") or "").strip()
        if not id_model_openai:
            config = akun_openai.get("config", {})
            if isinstance(config, dict):
                id_model_openai = str(config.get("model_id") or "").strip()

    if not kunci_api_openai:
        kunci_api_openai = str(os.getenv("OPENAI_API_KEY") or "").strip()

    if not kunci_api_openai:
        requests = [
            _buat_request_izin(
                kind="provider_account",
                provider="openai",
                account_id=akun_openai_pilihan,
                reason="Token OpenAI belum tersedia untuk planner agent.",
                action_hint="Isi token provider OpenAI di Setelan > Akun Integrasi.",
            )
        ]

        with_izin = _buat_respons_butuh_izin(
            prompt=prompt_pengguna,
            summary="Planner berhenti karena butuh akses provider OpenAI.",
            model_id="",
            approval_requests=requests,
            provider_catalog=katalog_provider,
            mcp_catalog=katalog_mcp,
        )
        with suppress(Exception):
            await append_event(
                "agent.approval_requested",
                {"prompt": prompt_pengguna[:200], "reason": "missing_openai_key", "requests": requests},
            )
        if perlu_izin_saat_kurang:
            return with_izin

        return {
            "success": False,
            "error": "OpenAI API key belum tersedia. Isi provider 'openai' di dashboard atau set OPENAI_API_KEY.",
        }

    model_id = _normalisasi_id_model(
        id_model_openai or str(os.getenv("PLANNER_AI_MODEL") or DEFAULT_OPENAI_MODEL)
    )

    try:
        rencana_raw = await _rencanakan_aksi_dengan_openai(
            prompt=prompt_pengguna,
            model_id=model_id,
            api_key=kunci_api_openai,
            provider_catalog=katalog_provider,
            mcp_catalog=katalog_mcp,
        )
        rencana = _sanitasi_rencana(rencana_raw)
    except Exception as exc:
        return {"success": False, "error": f"Agent planner gagal: {exc}"}

    request_izin = _kumpulkan_request_izin_dari_rencana(
        rencana["steps"],
        provider_catalog=katalog_provider,
        mcp_catalog=katalog_mcp,
    )
    if request_izin and perlu_izin_saat_kurang:
        with suppress(Exception):
            await append_event(
                "agent.approval_requested",
                {
                    "prompt": prompt_pengguna[:200],
                    "reason": "missing_resources_for_plan",
                    "request_count": len(request_izin),
                    "requests": request_izin,
                },
            )
        return _buat_respons_butuh_izin(
            prompt=prompt_pengguna,
            summary="Rencana ada, tapi perlu izin untuk menambah puzzle/skill.",
            model_id=model_id,
            approval_requests=request_izin,
            provider_catalog=katalog_provider,
            mcp_catalog=katalog_mcp,
        )

    hasil_langkah: List[Dict[str, Any]] = []
    for step in rencana["steps"]:
        kind = step.get("kind")
        if kind == "note":
            hasil_langkah.append({"kind": "note", "success": True, "text": str(step.get("text") or "")})
            continue

        if kind == "provider_http":
            hasil = await _eksekusi_langkah_provider_http(ctx, step, katalog_provider, alat_http)
            hasil_langkah.append(hasil)
            continue

        if kind == "mcp_http":
            hasil = await _eksekusi_langkah_mcp_http(ctx, step, katalog_mcp, alat_http)
            hasil_langkah.append(hasil)
            continue

    langkah_aksi = [row for row in hasil_langkah if row.get("kind") in {"provider_http", "mcp_http"}]
    sukses_total = all(bool(row.get("success")) for row in langkah_aksi) if langkah_aksi else True

    provider_tersedia = {
        provider: sorted({str(row.get("account_id") or "default") for row in rows})
        for provider, rows in katalog_provider.items()
    }
    server_mcp_tersedia = sorted(katalog_mcp.keys())

    hasil = {
        "success": sukses_total,
        "summary": rencana["summary"],
        "final_message": rencana.get("final_message") or "",
        "model_id": model_id,
        "prompt": prompt_pengguna,
        "steps_planned": len(rencana["steps"]),
        "steps_executed": len(hasil_langkah),
        "step_results": hasil_langkah,
        "available_providers": provider_tersedia,
        "available_mcp_servers": server_mcp_tersedia,
    }
    with suppress(Exception):
        await append_event(
            "agent.workflow_executed",
            {
                "success": sukses_total,
                "steps_planned": len(rencana["steps"]),
                "steps_executed": len(hasil_langkah),
            },
        )
    return hasil
