from typing import Dict, Any
from datetime import datetime, timezone

from app.core.observability import logger
from app.core.queue import get_job_run_ids, get_run, list_enabled_job_ids

async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Generate daily report from recent job runs"""
    try:
        # Get recent runs (last 24 hours)
        now = datetime.now(timezone.utc)
        twenty_four_hours_ago = now.timestamp() - 86400  # 24 hours in seconds
        
        # Get all enabled jobs
        job_ids = await list_enabled_job_ids()
        
        report_data = {
            "generated_at": now.isoformat(),
            "period": "last_24_hours",
            "jobs_summary": [],
            "total_runs": 0,
            "successful_runs": 0,
            "failed_runs": 0
        }
        
        for job_id in job_ids:
            # Get recent runs for this job
            run_ids = await get_job_run_ids(job_id, 10)
            
            job_summary = {
                "job_id": job_id,
                "runs": []
            }
            
            for run_id in run_ids:
                run_data = await get_run(run_id)
                if not run_data:
                    continue

                # Check if run is within last 24 hours
                if run_data.scheduled_at.timestamp() < twenty_four_hours_ago:
                    continue

                status = run_data.status.value if hasattr(run_data.status, "value") else str(run_data.status)
                job_summary["runs"].append(
                    {
                        "run_id": run_id,
                        "status": status,
                        "started_at": run_data.started_at.isoformat() if run_data.started_at else None,
                        "finished_at": run_data.finished_at.isoformat() if run_data.finished_at else None,
                    }
                )

                report_data["total_runs"] += 1
                if status == "success":
                    report_data["successful_runs"] += 1
                elif status == "failed":
                    report_data["failed_runs"] += 1
            
            if job_summary["runs"]:
                report_data["jobs_summary"].append(job_summary)
        
        # Emit metrics
        ctx.metrics.increment("report_generated_total", tags={"type": "daily"})
        
        logger.info("Daily report generated", extra={
            "total_runs": report_data["total_runs"],
            "successful_runs": report_data["successful_runs"],
            "failed_runs": report_data["failed_runs"]
        })
        
        return report_data
        
    except Exception as e:
        logger.error(f"Daily report generation failed: {e}")
        return {"success": False, "error": str(e)}
