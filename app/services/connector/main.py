import asyncio
from typing import Any, Dict, List, Optional

import aiohttp
from redis.exceptions import RedisError, TimeoutError as RedisTimeoutError

from app.core.connector_accounts import (
    get_telegram_last_update_id,
    list_telegram_accounts,
    set_telegram_last_update_id,
)
from app.core.observability import logger
from app.core.queue import append_event, is_mode_fallback_redis, set_mode_fallback_redis
from app.core.redis_client import redis_client
from app.services.api.planner import PlannerRequest, build_plan_from_prompt
from app.services.api.planner_ai import PlannerAiRequest, build_plan_with_ai_dari_dashboard
from app.services.api.planner_execute import PlannerExecuteRequest, execute_prompt_plan

# Heartbeat constants
HEARTBEAT_TTL = 30  # seconds
CONNECTOR_PREFIX = "hb:connector"
AGENT_HEARTBEAT_KEY = "hb:agent:connector:telegram-bridge"

TELEGRAM_API_BASE = "https://api.telegram.org"
POLL_TIMEOUT_SEC = 3
POLL_LOOP_SLEEP_SEC = 1
IDLE_SLEEP_SEC = 2


async def _is_redis_ready() -> bool:
    try:
        await asyncio.wait_for(redis_client.ping(), timeout=0.5)
        return True
    except (RedisError, RedisTimeoutError, asyncio.TimeoutError, OSError):
        return False
    except Exception:
        return False


def _switch_fallback_redis(error: Exception) -> None:
    if is_mode_fallback_redis():
        return
    set_mode_fallback_redis(True)
    logger.warning(
        "Redis connector tidak tersedia, beralih ke fallback mode",
        extra={"error": str(error)},
    )


async def kirim_heartbeat_konektor(channel: str, account_id: str, status: str = "online"):
    """Update connector heartbeat in Redis."""
    if is_mode_fallback_redis():
        return

    key = f"{CONNECTOR_PREFIX}:{channel}:{account_id}"
    try:
        await redis_client.setex(key, HEARTBEAT_TTL, status)
    except Exception as exc:
        _switch_fallback_redis(exc)


async def pantau_konektor():
    """Monitor connector heartbeats and log when one goes stale."""
    while True:
        try:
            if is_mode_fallback_redis():
                await asyncio.sleep(10)
                continue

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
            _switch_fallback_redis(exc)
            logger.error(f"Error monitoring connectors: {exc}")
            await asyncio.sleep(5)


def _chat_diizinkan(chat_id: Any, allowed_chat_ids: List[str]) -> bool:
    if not allowed_chat_ids:
        return True
    chat_id_str = str(chat_id).strip()
    return chat_id_str in {str(value).strip() for value in allowed_chat_ids if str(value).strip()}


def _ekstrak_perintah_dan_prompt_dari_teks(text: str) -> Dict[str, str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return {"command": "", "prompt": ""}

    daftar_prefix = {
        "/run": "run",
        "/exec": "exec",
    }
    lowered = cleaned.lower()
    for prefix, command in daftar_prefix.items():
        if lowered.startswith(prefix):
            return {"command": command, "prompt": cleaned[len(prefix) :].strip()}
    return {"command": "", "prompt": ""}


def _format_balasan_rencana(rencana: Any) -> str:
    def _format_jadwal(job: Any) -> str:
        schedule = getattr(getattr(job, "job_spec", None), "schedule", None)
        if not schedule:
            return "tanpa jadwal (event-driven)"
        interval = getattr(schedule, "interval_sec", None)
        cron = getattr(schedule, "cron", None)
        if interval:
            return f"interval {interval} detik"
        if cron:
            return f"cron {cron}"
        return "tanpa jadwal"

    lines = [
        "Spio Manager: rencana awal sudah siap (belum dieksekusi).",
        "",
        "Ringkasan Diskusi",
        f"- Sumber perencana: {getattr(rencana, 'planner_source', '-')}",
        f"- Ringkasan: {getattr(rencana, 'summary', '-')}",
        f"- Jumlah rencana job: {len(getattr(rencana, 'jobs', []))}",
    ]

    jobs = getattr(rencana, "jobs", []) or []
    if jobs:
        lines.append("- Draft job:")
    for row in jobs[:6]:
        job_spec = getattr(row, "job_spec", None)
        job_id = getattr(job_spec, "job_id", "-")
        job_type = getattr(job_spec, "type", "-")
        reason = getattr(row, "reason", "-")
        lines.append(f"  - {job_id} [{job_type}] ({_format_jadwal(row)})")
        lines.append(f"    alasan: {reason}")

    assumptions = list(getattr(rencana, "assumptions", []) or [])
    if assumptions:
        lines.append("- Asumsi:")
        for item in assumptions[:4]:
            lines.append(f"  - {item}")

    warnings = list(getattr(rencana, "warnings", []) or [])
    if warnings:
        lines.append("- Catatan:")
        for item in warnings[:4]:
            lines.append(f"  - {item}")

    lines.extend(
        [
            "",
            "Lanjutkan dengan /exec <instruksi final> kalau sudah oke.",
        ]
    )

    text = "\n".join(lines)
    if len(text) > 3800:
        return text[:3797] + "..."
    return text


def _format_balasan_eksekusi(execution: Any) -> str:
    def terjemah_status(status: Optional[str]) -> str:
        peta = {
            "created": "dibuat",
            "updated": "diperbarui",
            "error": "gagal simpan",
            "queued": "antre",
            "running": "berjalan",
            "success": "berhasil",
            "failed": "gagal",
        }
        if not status:
            return "-"
        return peta.get(status, status)

    def label_perencana(source: Optional[str]) -> str:
        if source == "smolagents":
            return "Smolagents"
        if source == "rule_based":
            return "Berbasis Aturan"
        return str(source or "-")

    def format_detail_teknis_per_hasil(row: Any) -> str:
        run_status = row.run_status or row.queue_status or "-"
        return (
            f"- job_id={row.job_id}; type={row.type}; "
            f"create_status={row.create_status}; run_status={run_status}"
        )

    jumlah_dibuat = sum(1 for row in execution.results if row.create_status == "created")
    jumlah_diperbarui = sum(1 for row in execution.results if row.create_status == "updated")
    jumlah_error = sum(1 for row in execution.results if row.create_status == "error")
    run_berhasil = sum(1 for row in execution.results if row.run_status == "success")
    run_gagal = sum(1 for row in execution.results if row.run_status == "failed")

    lines = [
        "Spio: perintah sudah diproses.",
        "",
        "Ringkasan (Bahasa Indonesia)",
        f"- Sumber perencana: {label_perencana(getattr(execution, 'planner_source', None))}",
        f"- Ringkasan sistem: {execution.summary}",
        f"- Jumlah tugas: {len(execution.results)} (dibuat {jumlah_dibuat}, diperbarui {jumlah_diperbarui}, gagal {jumlah_error})",
        f"- Hasil eksekusi: berhasil {run_berhasil}, gagal {run_gagal}",
    ]

    if execution.results:
        lines.append("- Sampel hasil:")
    for row in execution.results[:5]:
        run_label = row.run_status or row.queue_status or "-"
        lines.append(f"  - {row.job_id}: {terjemah_status(row.create_status)}, eksekusi {terjemah_status(run_label)}")

    if execution.warnings:
        lines.append("- Catatan: " + "; ".join(execution.warnings[:2]))

    lines.extend(
        [
            "",
            "Detail Teknis Sistem",
            f"- planner_source={execution.planner_source}",
            f"- total_results={len(execution.results)}",
            f"- create_status: created={jumlah_dibuat}, updated={jumlah_diperbarui}, error={jumlah_error}",
            f"- run_status: success={run_berhasil}, failed={run_gagal}",
        ]
    )

    for row in execution.results[:5]:
        lines.append(format_detail_teknis_per_hasil(row))

    lines.extend(
        [
            "",
            "Terjemahan Istilah Teknis",
            "- created=dibuat; updated=diperbarui; error=gagal simpan",
            "- queued=antre; running=berjalan; success=berhasil; failed=gagal",
        ]
    )

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
            "Spio siap.\n"
            "- /run <perintah> = diskusi manager (rencana dulu, belum jalan)\n"
            "- /exec <perintah> = eksekusi penuh",
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

    perintah = _ekstrak_perintah_dan_prompt_dari_teks(text)
    command = perintah.get("command", "")
    prompt = perintah.get("prompt", "")
    if not command:
        await _kirim_pesan_telegram(
            session,
            bot_token,
            chat_id,
            "Perintah belum dikenali. Pakai /run <instruksi> atau /exec <instruksi>.",
        )
        return

    if not prompt:
        await _kirim_pesan_telegram(
            session,
            bot_token,
            chat_id,
            "Perintah kosong. Pakai format: /run <instruksi> atau /exec <instruksi>.",
        )
        return

    await append_event(
        "telegram.command.received",
        {"account_id": id_akun, "chat_id": str(chat_id), "prompt": prompt[:200], "command": command},
    )

    try:
        use_ai = bool(account.get("use_ai", True))
        force_rule_based = bool(account.get("force_rule_based", False))
        timezone = str(account.get("timezone", "Asia/Jakarta"))
        default_channel = str(account.get("default_channel", "telegram"))
        default_account_id = str(account.get("default_account_id", id_akun))

        if command == "run":
            if use_ai:
                plan_request = PlannerAiRequest(
                    prompt=prompt,
                    force_rule_based=force_rule_based,
                    timezone=timezone,
                    default_channel=default_channel,
                    default_account_id=default_account_id,
                )
                rencana = await build_plan_with_ai_dari_dashboard(plan_request)
            else:
                plan_request = PlannerRequest(
                    prompt=prompt,
                    timezone=timezone,
                    default_channel=default_channel,
                    default_account_id=default_account_id,
                )
                rencana = build_plan_from_prompt(plan_request)

            teks_balasan = _format_balasan_rencana(rencana)
            await _kirim_pesan_telegram(session, bot_token, chat_id, teks_balasan)
            await append_event(
                "telegram.command.planned",
                {
                    "account_id": id_akun,
                    "chat_id": str(chat_id),
                    "planner_source": rencana.planner_source,
                    "job_count": len(rencana.jobs),
                },
            )
        else:
            request = PlannerExecuteRequest(
                prompt=prompt,
                use_ai=use_ai,
                force_rule_based=force_rule_based,
                run_immediately=bool(account.get("run_immediately", True)),
                wait_seconds=int(account.get("wait_seconds", 2)),
                timezone=timezone,
                default_channel=default_channel,
                default_account_id=default_account_id,
            )

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
        pesan_error = "\n".join(
            [
                "Spio gagal menjalankan perintah.",
                f"Ringkasan: {exc}",
                f"Detail teknis: error_type={exc.__class__.__name__}; error_message={exc}",
            ]
        )
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
                if not is_mode_fallback_redis():
                    try:
                        await redis_client.setex(AGENT_HEARTBEAT_KEY, HEARTBEAT_TTL, "connected")
                    except Exception as exc:
                        _switch_fallback_redis(exc)

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
    redis_ready = await _is_redis_ready()
    set_mode_fallback_redis(not redis_ready)
    if not redis_ready:
        logger.warning("Connector berjalan tanpa Redis (fallback mode aktif).")

    await append_event(
        "system.connector_started",
        {"message": "Connector service started", "redis_ready": redis_ready},
    )
    daftar_tugas = [
        asyncio.create_task(telegram_connector()),
        asyncio.create_task(pantau_konektor()),
    ]
    await asyncio.gather(*daftar_tugas)


if __name__ == "__main__":
    asyncio.run(connector_main())
