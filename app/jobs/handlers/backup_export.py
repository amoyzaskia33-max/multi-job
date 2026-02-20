from typing import Dict, Any
import json
from datetime import datetime, timezone

from app.core.observability import logger
from app.core.queue import get_job_run_ids, get_job_spec, get_run, list_enabled_job_ids

async def run(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """Export job registry and run history to file"""
    try:
        output_path = inputs.get("output_path", "backup.json")
        
        # Get all job specs
        job_ids = await list_enabled_job_ids()
        jobs_data = {}
        
        for job_id in job_ids:
            spec = await get_job_spec(job_id)
            if spec:
                jobs_data[job_id] = spec
        
        # Get recent runs (last 10 per job)
        runs_data = {}
        for job_id in job_ids:
            run_ids = await get_job_run_ids(job_id, 10)
            runs_data[job_id] = []
            
            for run_id in run_ids:
                run_data = await get_run(run_id)
                if run_data:
                    if hasattr(run_data, "model_dump"):
                        runs_data[job_id].append(run_data.model_dump(mode="json"))
                    else:
                        runs_data[job_id].append(run_data.dict())
        
        # Create backup data
        backup_data = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "jobs": jobs_data,
            "runs": runs_data
        }
        
        # Use files tool to write backup
        files_tool = ctx.tools.get("files")
        if files_tool:
            result = await files_tool.run({
                "action": "write",
                "path": output_path,
                "content": json.dumps(backup_data, indent=2)
            }, ctx)
            
            if result.get("success"):
                logger.info("Backup exported successfully", extra={
                    "output_path": output_path,
                    "job_count": len(jobs_data),
                    "run_count": sum(len(runs) for runs in runs_data.values())
                })
                return {
                    "success": True,
                    "message": f"Backup exported to {output_path}",
                    "job_count": len(jobs_data),
                    "run_count": sum(len(runs) for runs in runs_data.values())
                }
            else:
                return {"success": False, "error": result.get("error", "Unknown error")}
        else:
            return {"success": False, "error": "Files tool not available"}
            
    except Exception as e:
        logger.error(f"Backup export failed: {e}")
        return {"success": False, "error": str(e)}
