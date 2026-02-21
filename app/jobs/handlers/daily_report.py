from typing import Dict, Any
from datetime import datetime, timezone

from app.core.observability import logger
from app.core.queue import get_job_run_ids, get_run, list_enabled_job_ids

async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Generate daily report from recent job runs"""
    try:
        # Get recent runs (last 24 hours)
        sekarang = datetime.now(timezone.utc)
        batas_24_jam_lalu = sekarang.timestamp() - 86400  # 24 hours in seconds

        # Get all enabled jobs
        daftar_id_job = await list_enabled_job_ids()

        data_laporan = {
            "generated_at": sekarang.isoformat(),
            "period": "last_24_hours",
            "jobs_summary": [],
            "total_runs": 0,
            "successful_runs": 0,
            "failed_runs": 0,
        }

        for job_id in daftar_id_job:
            # Get recent runs for this job
            daftar_id_run = await get_job_run_ids(job_id, 10)

            ringkasan_job = {"job_id": job_id, "runs": []}

            for run_id in daftar_id_run:
                data_run = await get_run(run_id)
                if not data_run:
                    continue

                # Check if run is within last 24 hours
                if data_run.scheduled_at.timestamp() < batas_24_jam_lalu:
                    continue

                status_run = data_run.status.value if hasattr(data_run.status, "value") else str(data_run.status)
                ringkasan_job["runs"].append(
                    {
                        "run_id": run_id,
                        "status": status_run,
                        "started_at": data_run.started_at.isoformat() if data_run.started_at else None,
                        "finished_at": data_run.finished_at.isoformat() if data_run.finished_at else None,
                    }
                )

                data_laporan["total_runs"] += 1
                if status_run == "success":
                    data_laporan["successful_runs"] += 1
                elif status_run == "failed":
                    data_laporan["failed_runs"] += 1

            if ringkasan_job["runs"]:
                data_laporan["jobs_summary"].append(ringkasan_job)

        # Emit metrics
        ctx.metrics.increment("report_generated_total", tags={"type": "daily"})

        logger.info(
            "Daily report generated",
            extra={
                "total_runs": data_laporan["total_runs"],
                "successful_runs": data_laporan["successful_runs"],
                "failed_runs": data_laporan["failed_runs"],
            },
        )

        return data_laporan

    except Exception as e:
        logger.error(f"Daily report generation failed: {e}")
        return {"success": False, "error": str(e)}
