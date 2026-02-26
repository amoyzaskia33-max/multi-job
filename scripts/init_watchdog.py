import asyncio
from app.core.queue import save_job_spec, enable_job

async def init_proactive_watchdog():
    job_id = "system_autonomous_watchdog"
    spec = {
        "job_id": job_id,
        "type": "agent.workflow",
        "schedule": {
            "interval_sec": 3600 # Run every hour
        },
        "inputs": {
            "prompt": "You are the Executive Watchdog for the Chairman. Task: 1) Scan all branch metrics and armory status. 2) Identify bottlenecks (like NO AMMO) or profit trends. 3) PROACTIVELY report your findings to the Executive Boardroom chat. 4) If a branch is stalled, suggest a fix. Be brief, professional, and business-oriented.",
            "agent_key": "watchdog:system",
            "allow_sensitive_commands": False
        }
    }
    await save_job_spec(job_id, spec)
    await enable_job(job_id)
    print(f"Proactive watchdog '{job_id}' has been initialized and enabled.")

if __name__ == "__main__":
    asyncio.run(init_proactive_watchdog())
