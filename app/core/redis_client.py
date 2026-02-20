import inspect

import redis.asyncio as redis
from .config import settings

# Global Redis client instance
redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    password=settings.REDIS_PASSWORD,
    decode_responses=True,
    encoding="utf-8",
    # Keep failures fast when Redis is unavailable so API endpoints return quickly.
    socket_connect_timeout=0.2,
    socket_timeout=0.2,
    retry_on_timeout=False,
)

# Helper functions for common Redis operations
async def get_redis():
    return redis_client

async def close_redis():
    close_async = getattr(redis_client, "aclose", None)
    if callable(close_async):
        await close_async()
        return
    close_result = redis_client.close()
    if inspect.isawaitable(close_result):
        await close_result
