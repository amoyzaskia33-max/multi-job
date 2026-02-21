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


async def kirim_heartbeat_konektor(channel: str, account_id: str, status: str = "online"):
    """Update connector heartbeat in Redis."""
    key = f"{CONNECTOR_PREFIX}:{channel}:{account_id}"
    await redis_client.setex(key, HEARTBEAT_TTL, status)


async def pantau_konektor():
    """Monitor connector heartbeats and log when one goes stale."""
    while True:
        try:
            daftar_kunci = await redis_client.keys(f"{CONNECTOR_PREFIX}:*")

            for key in daftar_kunci:
                bagian = key.split(":")
                if len(bagian) < 4:
                    continue
                channel = bagian[2]
                account_id = bagian[3]
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


def _chat_diizinkan(chat_id: Any, allowed_chat_ids: List[str]) -> bool:
    if not allowed_chat_ids:
        return True
    chat_id_str = str(chat_id).strip()
    return chat_id_str in {str(value).strip() for value in allowed_chat_ids if str(value).strip()}


def _ekstrak_prompt_dari_teks(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""

    for prefix in ("/ai", "/run", "/exec"):
        if cleaned.lower().startswith(prefix):
            return cleaned[len(prefix) :].strip()
    return cleaned


def _format_balasan_eksekusi(execution: Any) -> str:
    jumlah_dibuat = sum(1 for row in execution.results if row.create_status == "created")
    jumlah_diperbarui = sum(1 for row in execution.results if row.create_status == "updated")
    jumlah_error = sum(1 for row in execution.results if row.create_status == "error")
    run_berhasil = sum(1 for row in execution.results if row.run_status == "success")
    run_gagal = sum(1 for row in execution.results if row.run_status == "failed")

    lines = [
        "Siap, perintah sudah diproses.",
        f"Planner: {execution.planner_source}",
        execution.summary,
        f"Job: {len(execution.results)} (created {jumlah_dibuat}, updated {jumlah_diperbarui}, error {jumlah_error})",
        f"Run: success {run_berhasil}, failed {run_gagal}",
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


async def _panggil_api_telegram(
    session: aiohttp.ClientSession,
    bot_token: str,
    method: str,
    payload: Dict[str, Any],
) -> Optional[Any]:
    url_api = f"{TELEGRAM_API_BASE}/bot{bot_token}/{method}"
    try:
        async with session.post(url_api, json=payload) as response:
            data_respons = await response.json(content_type=None)
            if response.status >= 400:
                logger.warning(
                    "Telegram API status error",
                    extra={"method": method, "status": response.status, "response": data_respons},
                )
                return None
            if not isinstance(data_respons, dict) or not data_respons.get("ok"):
                logger.warning(
                    "Telegram API returned non-ok payload",
                    extra={"method": method, "response": data_respons},
                )
                return None
            return data_respons.get("result")
    except Exception as exc:
        logger.warning("Telegram API call failed", extra={"method": method, "error": str(exc)})
        return None


async def _kirim_pesan_telegram(
    session: aiohttp.ClientSession,
    bot_token: str,
    chat_id: Any,
    text: str,
) -> None:
    await _panggil_api_telegram(
        session,
        bot_token,
        "sendMessage",
        {"chat_id": chat_id, "text": text[:3800]},
    )


async def _proses_update_telegram(
    session: aiohttp.ClientSession,
    account: Dict[str, Any],
    update: Dict[str, Any],
) -> None:
    id_akun = account["account_id"]
    bot_token = str(account.get("bot_token") or "")

    id_update = int(update.get("update_id") or 0)
    if id_update > 0:
        await set_telegram_last_update_id(id_akun, id_update)

    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = str(message.get("text") or "").strip()

    if chat_id is None or not text:
        return

    if text.lower() in {"/start", "/help"}:
        await _kirim_pesan_telegram(
            session,
            bot_token,
            chat_id,
            "Kirim instruksi biasa atau pakai /ai <perintah>.\nContoh: /ai pantau telegram akun bot_a01 tiap 30 detik",
        )
        return

    if not _chat_diizinkan(chat_id, account.get("allowed_chat_ids", [])):
        await _kirim_pesan_telegram(
            session,
            bot_token,
            chat_id,
            "Chat ini belum diizinkan untuk menjalankan perintah.",
        )
        await append_event(
            "telegram.command.rejected",
            {"account_id": id_akun, "chat_id": str(chat_id), "reason": "chat_not_allowed"},
        )
        return

    prompt = _ekstrak_prompt_dari_teks(text)
    if not prompt:
        await _kirim_pesan_telegram(
            session,
            bot_token,
            chat_id,
            "Perintah kosong. Pakai format: /ai <instruksi>.",
        )
        return

    await append_event(
        "telegram.command.received",
        {"account_id": id_akun, "chat_id": str(chat_id), "prompt": prompt[:200]},
    )

    request = PlannerExecuteRequest(
        prompt=prompt,
        use_ai=bool(account.get("use_ai", True)),
        force_rule_based=bool(account.get("force_rule_based", False)),
        run_immediately=bool(account.get("run_immediately", True)),
        wait_seconds=int(account.get("wait_seconds", 2)),
        timezone=str(account.get("timezone", "Asia/Jakarta")),
        default_channel=str(account.get("default_channel", "telegram")),
        default_account_id=str(account.get("default_account_id", id_akun)),
    )

    try:
        hasil_eksekusi = await execute_prompt_plan(request)
        teks_balasan = _format_balasan_eksekusi(hasil_eksekusi)
        await _kirim_pesan_telegram(session, bot_token, chat_id, teks_balasan)

        await append_event(
            "telegram.command.executed",
            {
                "account_id": id_akun,
                "chat_id": str(chat_id),
                "planner_source": hasil_eksekusi.planner_source,
                "job_count": len(hasil_eksekusi.results),
            },
        )
    except Exception as exc:
        pesan_error = f"Gagal menjalankan perintah: {exc}"
        await _kirim_pesan_telegram(session, bot_token, chat_id, pesan_error)
        await append_event(
            "telegram.command.failed",
            {"account_id": id_akun, "chat_id": str(chat_id), "error": str(exc)},
        )


async def _polling_akun(session: aiohttp.ClientSession, account: Dict[str, Any]) -> None:
    id_akun = account["account_id"]
    bot_token = str(account.get("bot_token") or "").strip()
    aktif = bool(account.get("enabled", True))

    if not aktif:
        await kirim_heartbeat_konektor("telegram", id_akun, "offline")
        return

    if not bot_token:
        await kirim_heartbeat_konektor("telegram", id_akun, "degraded")
        return

    await kirim_heartbeat_konektor("telegram", id_akun, "connected")

    id_update_terakhir = await get_telegram_last_update_id(id_akun)
    payload: Dict[str, Any] = {"timeout": POLL_TIMEOUT_SEC}
    if id_update_terakhir > 0:
        payload["offset"] = id_update_terakhir + 1

    daftar_update = await _panggil_api_telegram(session, bot_token, "getUpdates", payload)
    if not daftar_update:
        return

    for update in daftar_update:
        if isinstance(update, dict):
            await _proses_update_telegram(session, account, update)


async def telegram_connector():
    """Telegram bridge: read messages and execute planner commands."""
    logger.info("Starting Telegram connector bridge")

    timeout = aiohttp.ClientTimeout(total=POLL_TIMEOUT_SEC + 8)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        while True:
            try:
                daftar_akun = await list_telegram_accounts(include_secret=True)
                await redis_client.setex(AGENT_HEARTBEAT_KEY, HEARTBEAT_TTL, "connected")

                if not daftar_akun:
                    await asyncio.sleep(IDLE_SLEEP_SEC)
                    continue

                for account in daftar_akun:
                    await _polling_akun(session, account)

                await asyncio.sleep(POLL_LOOP_SLEEP_SEC)
            except Exception as exc:
                logger.error(f"Telegram connector loop error: {exc}")
                await asyncio.sleep(3)


async def connector_main():
    """Main connector loop."""
    await append_event("system.connector_started", {"message": "Connector service started"})
    daftar_tugas = [
        asyncio.create_task(telegram_connector()),
        asyncio.create_task(pantau_konektor()),
    ]
    await asyncio.gather(*daftar_tugas)


if __name__ == "__main__":
    asyncio.run(connector_main())
