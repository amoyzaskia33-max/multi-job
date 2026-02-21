import asyncio
from typing import Any, Dict, List, Optional

import aiohttp

from app.core.connector_accounts import (
    get_telegram_last_update_id,
    list_telegram_accounts,
    set_telegram_last_update_id,
)
from app.core.observability import logger
from app.core.queue import append_event
from app.core.redis_client import redis_client
from app.services.api.planner_execute import PlannerExecuteRequest, execute_prompt_plan

# Heartbeat constants
HEARTBEAT_TTL = 30  # seconds
CONNECTOR_PREFIX = "hb:connector"
AGENT_HEARTBEAT_KEY = "hb:agent:connector:telegram-bridge"

TELEGRAM_API_BASE = "https://api.telegram.org"
POLL_TIMEOUT_SEC = 3
POLL_LOOP_SLEEP_SEC = 1
IDLE_SLEEP_SEC = 2


async def connector_heartbeat(channel: str, account_id: str, status: str = "online"):
    """Update connector heartbeat in Redis."""
    key = f"{CONNECTOR_PREFIX}:{channel}:{account_id}"
    await redis_client.setex(key, HEARTBEAT_TTL, status)


async def monitor_connectors():
    """Monitor connector heartbeats and log when one goes stale."""
    while True:
        try:
            keys = await redis_client.keys(f"{CONNECTOR_PREFIX}:*")

            for key in keys:
                parts = key.split(":")
                if len(parts) < 4:
                    continue
                channel = parts[2]
                account_id = parts[3]
                status = await redis_client.get(key)
                if not status:
                    logger.warning(
                        "Connector heartbeat expired",
                        extra={"channel": channel, "account_id": account_id},
                    )

            await asyncio.sleep(10)
        except Exception as exc:
            logger.error(f"Error monitoring connectors: {exc}")
            await asyncio.sleep(5)


def _is_chat_allowed(chat_id: Any, allowed_chat_ids: List[str]) -> bool:
    if not allowed_chat_ids:
        return True
    chat_id_str = str(chat_id).strip()
    return chat_id_str in {str(value).strip() for value in allowed_chat_ids if str(value).strip()}


def _extract_prompt_from_text(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    for prefix in ("/ai", "/run", "/exec"):
        if cleaned.lower().startswith(prefix):
            return cleaned[len(prefix) :].strip()
    return cleaned


def _format_execution_reply(execution: Any) -> str:
    created = sum(1 for row in execution.results if row.create_status == "created")
    updated = sum(1 for row in execution.results if row.create_status == "updated")
    errors = sum(1 for row in execution.results if row.create_status == "error")
    run_success = sum(1 for row in execution.results if row.run_status == "success")
    run_failed = sum(1 for row in execution.results if row.run_status == "failed")

    lines = [
        "Siap, perintah sudah diproses.",
        f"Planner: {execution.planner_source}",
        execution.summary,
        f"Job: {len(execution.results)} (created {created}, updated {updated}, error {errors})",
        f"Run: success {run_success}, failed {run_failed}",
    ]

    for row in execution.results[:5]:
        run_label = row.run_status or row.queue_status or "-"
        lines.append(f"- {row.job_id}: {row.create_status}, run {run_label}")

    if execution.warnings:
        lines.append("Catatan: " + "; ".join(execution.warnings[:2]))

    text = "\n".join(lines)
    if len(text) > 3800:
        return text[:3797] + "..."
    return text


async def _telegram_api_call(
    session: aiohttp.ClientSession,
    bot_token: str,
    method: str,
    payload: Dict[str, Any],
) -> Optional[Any]:
    url = f"{TELEGRAM_API_BASE}/bot{bot_token}/{method}"
    try:
        async with session.post(url, json=payload) as response:
            data = await response.json(content_type=None)
            if response.status >= 400:
                logger.warning(
                    "Telegram API status error",
                    extra={"method": method, "status": response.status, "response": data},
                )
                return None
            if not isinstance(data, dict) or not data.get("ok"):
                logger.warning(
                    "Telegram API returned non-ok payload",
                    extra={"method": method, "response": data},
                )
                return None
            return data.get("result")
    except Exception as exc:
        logger.warning("Telegram API call failed", extra={"method": method, "error": str(exc)})
        return None


async def _send_telegram_message(
    session: aiohttp.ClientSession,
    bot_token: str,
    chat_id: Any,
    text: str,
) -> None:
    await _telegram_api_call(
        session,
        bot_token,
        "sendMessage",
        {"chat_id": chat_id, "text": text[:3800]},
    )


async def _process_telegram_update(
    session: aiohttp.ClientSession,
    account: Dict[str, Any],
    update: Dict[str, Any],
) -> None:
    account_id = account["account_id"]
    bot_token = str(account.get("bot_token") or "")

    update_id = int(update.get("update_id") or 0)
    if update_id > 0:
        await set_telegram_last_update_id(account_id, update_id)

    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = str(message.get("text") or "").strip()

    if chat_id is None or not text:
        return

    if text.lower() in {"/start", "/help"}:
        await _send_telegram_message(
            session,
            bot_token,
            chat_id,
            "Kirim instruksi biasa atau pakai /ai <perintah>.\nContoh: /ai pantau telegram akun bot_a01 tiap 30 detik",
        )
        return

    if not _is_chat_allowed(chat_id, account.get("allowed_chat_ids", [])):
        await _send_telegram_message(
            session,
            bot_token,
            chat_id,
            "Chat ini belum diizinkan untuk menjalankan perintah.",
        )
        await append_event(
            "telegram.command.rejected",
            {"account_id": account_id, "chat_id": str(chat_id), "reason": "chat_not_allowed"},
        )
        return

    prompt = _extract_prompt_from_text(text)
    if not prompt:
        await _send_telegram_message(
            session,
            bot_token,
            chat_id,
            "Perintah kosong. Pakai format: /ai <instruksi>.",
        )
        return

    await append_event(
        "telegram.command.received",
        {"account_id": account_id, "chat_id": str(chat_id), "prompt": prompt[:200]},
    )

    request = PlannerExecuteRequest(
        prompt=prompt,
        use_ai=bool(account.get("use_ai", True)),
        force_rule_based=bool(account.get("force_rule_based", False)),
        run_immediately=bool(account.get("run_immediately", True)),
        wait_seconds=int(account.get("wait_seconds", 2)),
        timezone=str(account.get("timezone", "Asia/Jakarta")),
        default_channel=str(account.get("default_channel", "telegram")),
        default_account_id=str(account.get("default_account_id", account_id)),
    )

    try:
        execution = await execute_prompt_plan(request)
        reply_text = _format_execution_reply(execution)
        await _send_telegram_message(session, bot_token, chat_id, reply_text)

        await append_event(
            "telegram.command.executed",
            {
                "account_id": account_id,
                "chat_id": str(chat_id),
                "planner_source": execution.planner_source,
                "job_count": len(execution.results),
            },
        )
    except Exception as exc:
        error_message = f"Gagal menjalankan perintah: {exc}"
        await _send_telegram_message(session, bot_token, chat_id, error_message)
        await append_event(
            "telegram.command.failed",
            {"account_id": account_id, "chat_id": str(chat_id), "error": str(exc)},
        )


async def _poll_account(session: aiohttp.ClientSession, account: Dict[str, Any]) -> None:
    account_id = account["account_id"]
    bot_token = str(account.get("bot_token") or "").strip()
    enabled = bool(account.get("enabled", True))

    if not enabled:
        await connector_heartbeat("telegram", account_id, "offline")
        return

    if not bot_token:
        await connector_heartbeat("telegram", account_id, "degraded")
        return

    await connector_heartbeat("telegram", account_id, "connected")

    last_update_id = await get_telegram_last_update_id(account_id)
    payload: Dict[str, Any] = {"timeout": POLL_TIMEOUT_SEC}
    if last_update_id > 0:
        payload["offset"] = last_update_id + 1

    updates = await _telegram_api_call(session, bot_token, "getUpdates", payload)
    if not updates:
        return

    for update in updates:
        if isinstance(update, dict):
            await _process_telegram_update(session, account, update)


async def telegram_connector():
    """Telegram bridge: read messages and execute planner commands."""
    logger.info("Starting Telegram connector bridge")

    timeout = aiohttp.ClientTimeout(total=POLL_TIMEOUT_SEC + 8)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        while True:
            try:
                accounts = await list_telegram_accounts(include_secret=True)
                await redis_client.setex(AGENT_HEARTBEAT_KEY, HEARTBEAT_TTL, "connected")

                if not accounts:
                    await asyncio.sleep(IDLE_SLEEP_SEC)
                    continue

                for account in accounts:
                    await _poll_account(session, account)

                await asyncio.sleep(POLL_LOOP_SLEEP_SEC)
            except Exception as exc:
                logger.error(f"Telegram connector loop error: {exc}")
                await asyncio.sleep(3)


async def connector_main():
    """Main connector loop."""
    await append_event("system.connector_started", {"message": "Connector service started"})
    tasks = [
        asyncio.create_task(telegram_connector()),
        asyncio.create_task(monitor_connectors()),
    ]
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(connector_main())
