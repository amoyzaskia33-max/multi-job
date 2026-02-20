import asyncio

from app.core.observability import logger
from app.core.queue import append_event
from app.core.scheduler import Scheduler

async def scheduler_main():
    """Main scheduler loop"""
    scheduler = Scheduler()
    logger.info("Scheduler started")
    await append_event("system.scheduler_started", {"message": "Scheduler started"})
    
    try:
        await scheduler.start()
    except KeyboardInterrupt:
        logger.info("Scheduler shutting down")
        await scheduler.stop()

if __name__ == "__main__":
    asyncio.run(scheduler_main())
