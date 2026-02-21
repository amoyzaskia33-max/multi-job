import asyncio
from datetime import datetime, timezone
from typing import Any, Dict


async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Synthetic workload handler for load simulation (no external API dependency)."""
    work_ms_raw = inputs.get("work_ms", 8000)
    try:
        work_ms = int(work_ms_raw)
    except Exception:
        work_ms = 8000
    work_ms = max(100, min(work_ms, 300000))

    payload_kb_raw = inputs.get("payload_kb", 0)
    try:
        payload_kb = int(payload_kb_raw)
    except Exception:
        payload_kb = 0
    payload_kb = max(0, min(payload_kb, 128))

    mulai = datetime.now(timezone.utc)
    await asyncio.sleep(work_ms / 1000.0)
    selesai = datetime.now(timezone.utc)

    # Optional payload to emulate larger run outputs without external IO.
    payload_echo = ""
    if payload_kb > 0:
        payload_echo = "x" * (payload_kb * 1024)

    if ctx.metrics:
        ctx.metrics.increment("simulation_heavy_total")
        ctx.metrics.observe("simulation_heavy_work_ms", work_ms)

    return {
        "success": True,
        "job_id": ctx.job_id,
        "run_id": ctx.run_id,
        "started_at": mulai.isoformat(),
        "finished_at": selesai.isoformat(),
        "work_ms": work_ms,
        "payload_kb": payload_kb,
        "payload_echo_size": len(payload_echo),
    }
