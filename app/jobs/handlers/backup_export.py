from typing import Dict, Any
import json
from datetime import datetime, timezone

from app.core.observability import logger
from app.core.queue import get_job_run_ids, get_job_spec, get_run, list_enabled_job_ids

async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Export job registry and run history to file"""
    try:
        path_output = inputs.get("output_path", "backup.json")

        # Get all job specs
        daftar_id_job = await list_enabled_job_ids()
        data_job = {}

        for job_id in daftar_id_job:
            spesifikasi = await get_job_spec(job_id)
            if spesifikasi:
                data_job[job_id] = spesifikasi

        # Get recent runs (last 10 per job)
        data_run = {}
        for job_id in daftar_id_job:
            daftar_id_run = await get_job_run_ids(job_id, 10)
            data_run[job_id] = []

            for run_id in daftar_id_run:
                run_item = await get_run(run_id)
                if run_item:
                    if hasattr(run_item, "model_dump"):
                        data_run[job_id].append(run_item.model_dump(mode="json"))
                    else:
                        data_run[job_id].append(run_item.dict())

        # Create backup data
        data_backup = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "jobs": data_job,
            "runs": data_run,
        }

        # Use files tool to write backup
        files_tool = ctx.tools.get("files")
        if files_tool:
            hasil_tulis = await files_tool.run(
                {"action": "write", "path": path_output, "content": json.dumps(data_backup, indent=2)},
                ctx,
            )

            if hasil_tulis.get("success"):
                logger.info(
                    "Backup exported successfully",
                    extra={
                        "output_path": path_output,
                        "job_count": len(data_job),
                        "run_count": sum(len(runs) for runs in data_run.values()),
                    },
                )
                return {
                    "success": True,
                    "message": f"Backup exported to {path_output}",
                    "job_count": len(data_job),
                    "run_count": sum(len(runs) for runs in data_run.values()),
                }
            else:
                return {"success": False, "error": hasil_tulis.get("error", "Unknown error")}
        else:
            return {"success": False, "error": "Files tool not available"}

    except Exception as e:
        logger.error(f"Backup export failed: {e}")
        return {"success": False, "error": str(e)}
