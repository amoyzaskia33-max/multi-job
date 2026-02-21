import json
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from redis.exceptions import RedisError, ResponseError

from .models import QueueEvent, Run
from .redis_client import redis_client

# Redis stream key for jobs
STREAM_JOBS = "stream:jobs"
# Consumer group for workers
CG_WORKERS = "cg:workers"
# ZSET for delayed jobs (score = unix timestamp)
ZSET_DELAYED = "zset:delayed"
# Job registry keys
JOB_SPEC_PREFIX = "job:spec:"
JOB_ENABLED_SET = "job:enabled"
JOB_ALL_SET = "job:all"
RUN_PREFIX = "run:"
ZSET_RUNS = "zset:runs"
JOB_RUNS_PREFIX = "job:runs:"
EVENTS_LOG = "events:log"
EVENTS_MAX = 500


# In-memory fallback store used when Redis is unavailable.
_fallback_stream: List[Dict[str, Any]] = []
_fallback_stream_seq = 0
_fallback_delayed: List[Dict[str, Any]] = []
_fallback_job_specs: Dict[str, Dict[str, Any]] = {}
_fallback_job_all: set = set()
_fallback_job_enabled: set = set()
_fallback_runs: Dict[str, Dict[str, Any]] = {}
_fallback_run_scores: Dict[str, float] = {}
_fallback_job_runs: Dict[str, List[str]] = defaultdict(list)
_fallback_events: List[Dict[str, Any]] = []


def _sekarang_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _salin_nilai(value: Any) -> Any:
    return json.loads(json.dumps(value))


def _serialisasi_model(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(mode="json")
    return model.dict()


def _ke_dict_event(event: Union[QueueEvent, Dict[str, Any]]) -> Dict[str, Any]:
    if isinstance(event, QueueEvent):
        return _serialisasi_model(event)
    return dict(event)


def _ke_timestamp(value: Any) -> float:
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).timestamp()
        except ValueError:
            return time.time()
    return time.time()


def _id_pesan_fallback_berikutnya() -> str:
    global _fallback_stream_seq
    _fallback_stream_seq += 1
    return f"{int(time.time() * 1000)}-{_fallback_stream_seq}"


async def init_queue():
    """Initialize Redis streams and consumer group."""
    try:
        await redis_client.xgroup_create(name=STREAM_JOBS, groupname=CG_WORKERS, id="$", mkstream=True)
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise
    except RedisError:
        # Fallback mode: no setup required.
        return


async def enqueue_job(event: Union[QueueEvent, Dict[str, Any]]) -> str:
    """Enqueue a job to the stream."""
    event_data = _ke_dict_event(event)
    event_data["enqueued_at"] = _sekarang_iso()
    try:
        return await redis_client.xadd(STREAM_JOBS, {"data": json.dumps(event_data)})
    except RedisError:
        message_id = _id_pesan_fallback_berikutnya()
        _fallback_stream.append({"id": message_id, "data": _salin_nilai(event_data)})
        return message_id


async def dequeue_job(worker_id: str) -> Optional[Dict[str, Any]]:
    """Dequeue a job from the stream for a worker."""
    try:
        result = await redis_client.xreadgroup(
            groupname=CG_WORKERS,
            consumername=worker_id,
            streams={STREAM_JOBS: ">"},
            count=1,
            block=1000,
        )
        if not result:
            return None

        _, messages = result[0]
        if not messages:
            return None

        message_id, message_data = messages[0]
        data = json.loads(message_data["data"])
        await redis_client.xack(STREAM_JOBS, CG_WORKERS, message_id)
        return {"message_id": message_id, "data": data}
    except RedisError:
        if not _fallback_stream:
            return None
        item = _fallback_stream.pop(0)
        return {"message_id": item["id"], "data": _salin_nilai(item["data"])}


async def schedule_delayed_job(event: Union[QueueEvent, Dict[str, Any]], delay_seconds: int):
    """Schedule a job to be processed after a delay."""
    score = int(time.time()) + max(0, delay_seconds)
    payload = json.dumps(_ke_dict_event(event))
    try:
        await redis_client.zadd(ZSET_DELAYED, {payload: score})
    except RedisError:
        _fallback_delayed.append({"score": score, "payload": payload})


async def get_due_jobs() -> List[Dict[str, Any]]:
    """Get all jobs that are due (timestamp <= now)."""
    now = int(time.time())
    try:
        rows = await redis_client.zrangebyscore(ZSET_DELAYED, min=0, max=now, withscores=True)
        if not rows:
            return []

        payloads = [row[0] for row in rows]
        await redis_client.zrem(ZSET_DELAYED, *payloads)
        return [json.loads(payload) for payload in payloads]
    except RedisError:
        due_payloads: List[str] = []
        remaining: List[Dict[str, Any]] = []
        for item in _fallback_delayed:
            if int(item["score"]) <= now:
                due_payloads.append(item["payload"])
            else:
                remaining.append(item)
        _fallback_delayed[:] = remaining
        return [json.loads(payload) for payload in due_payloads]


async def save_job_spec(job_id: str, spec: Dict[str, Any]):
    """Save job specification to Redis."""
    try:
        await redis_client.set(f"{JOB_SPEC_PREFIX}{job_id}", json.dumps(spec))
        await redis_client.sadd(JOB_ALL_SET, job_id)
    except RedisError:
        _fallback_job_specs[job_id] = _salin_nilai(spec)
        _fallback_job_all.add(job_id)


async def get_job_spec(job_id: str) -> Optional[Dict[str, Any]]:
    """Get job specification from Redis."""
    try:
        payload = await redis_client.get(f"{JOB_SPEC_PREFIX}{job_id}")
        if not payload:
            return None
        return json.loads(payload)
    except RedisError:
        spec = _fallback_job_specs.get(job_id)
        return _salin_nilai(spec) if spec else None


async def list_job_specs() -> List[Dict[str, Any]]:
    """Get all stored job specs."""
    try:
        job_ids = sorted(await redis_client.smembers(JOB_ALL_SET))
    except RedisError:
        job_ids = sorted(_fallback_job_all)

    specs: List[Dict[str, Any]] = []
    for job_id in job_ids:
        spec = await get_job_spec(job_id)
        if spec:
            specs.append(spec)
    return specs


async def enable_job(job_id: str):
    """Mark job as enabled."""
    try:
        await redis_client.sadd(JOB_ENABLED_SET, job_id)
    except RedisError:
        _fallback_job_enabled.add(job_id)


async def disable_job(job_id: str):
    """Mark job as disabled."""
    try:
        await redis_client.srem(JOB_ENABLED_SET, job_id)
    except RedisError:
        _fallback_job_enabled.discard(job_id)


async def is_job_enabled(job_id: str) -> bool:
    """Check if a job is enabled."""
    try:
        return bool(await redis_client.sismember(JOB_ENABLED_SET, job_id))
    except RedisError:
        return job_id in _fallback_job_enabled


async def list_enabled_job_ids() -> List[str]:
    """Get all enabled job IDs."""
    try:
        return sorted(await redis_client.smembers(JOB_ENABLED_SET))
    except RedisError:
        return sorted(_fallback_job_enabled)


async def save_run(run: Run):
    """Save run status to Redis."""
    run_data = _serialisasi_model(run)
    score = _ke_timestamp(run_data.get("scheduled_at"))
    try:
        await redis_client.set(f"{RUN_PREFIX}{run.run_id}", json.dumps(run_data))
        await redis_client.zadd(ZSET_RUNS, {run.run_id: score})
    except RedisError:
        _fallback_runs[run.run_id] = _salin_nilai(run_data)
        _fallback_run_scores[run.run_id] = score


async def get_run(run_id: str) -> Optional[Run]:
    """Get run status from Redis."""
    try:
        payload = await redis_client.get(f"{RUN_PREFIX}{run_id}")
        if not payload:
            return None
        return Run(**json.loads(payload))
    except RedisError:
        payload = _fallback_runs.get(run_id)
        if not payload:
            return None
        return Run(**_salin_nilai(payload))


async def list_runs(limit: int = 50, job_id: Optional[str] = None, status: Optional[str] = None) -> List[Run]:
    """List runs ordered by latest schedule time."""
    candidate_limit = max(limit * 5, 100)
    try:
        run_ids = await redis_client.zrevrange(ZSET_RUNS, 0, candidate_limit - 1)
    except RedisError:
        ordered = sorted(_fallback_run_scores.items(), key=lambda item: item[1], reverse=True)
        run_ids = [run_id for run_id, _ in ordered[:candidate_limit]]

    runs: List[Run] = []
    for run_id in run_ids:
        run = await get_run(run_id)
        if not run:
            continue
        if job_id and run.job_id != job_id:
            continue
        if status:
            run_status = run.status.value if hasattr(run.status, "value") else str(run.status)
            if run_status != status:
                continue
        runs.append(run)
        if len(runs) >= limit:
            break
    return runs


async def add_run_to_job_history(job_id: str, run_id: str, max_history: int = 50):
    """Add run_id to job's run history list."""
    try:
        await redis_client.lpush(f"{JOB_RUNS_PREFIX}{job_id}", run_id)
        await redis_client.ltrim(f"{JOB_RUNS_PREFIX}{job_id}", 0, max_history - 1)
    except RedisError:
        rows = _fallback_job_runs[job_id]
        rows.insert(0, run_id)
        del rows[max_history:]


async def get_job_run_ids(job_id: str, limit: int = 20) -> List[str]:
    """Get recent run IDs for a job."""
    try:
        return await redis_client.lrange(f"{JOB_RUNS_PREFIX}{job_id}", 0, limit - 1)
    except RedisError:
        return list(_fallback_job_runs.get(job_id, []))[:limit]


async def get_queue_metrics() -> Dict[str, int]:
    """Get queue metrics for dashboard."""
    try:
        depth = await redis_client.xlen(STREAM_JOBS)
        delayed = await redis_client.zcard(ZSET_DELAYED)
        return {"depth": int(depth), "delayed": int(delayed)}
    except RedisError:
        return {"depth": len(_fallback_stream), "delayed": len(_fallback_delayed)}


async def append_event(event_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Append event to timeline."""
    event = {
        "id": str(uuid.uuid4()),
        "type": event_type,
        "timestamp": _sekarang_iso(),
        "data": data,
    }
    try:
        await redis_client.lpush(EVENTS_LOG, json.dumps(event))
        await redis_client.ltrim(EVENTS_LOG, 0, EVENTS_MAX - 1)
    except RedisError:
        _fallback_events.insert(0, _salin_nilai(event))
        del _fallback_events[EVENTS_MAX:]
    return event


async def get_events(limit: int = 200, since: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get latest events in ascending time order."""
    try:
        rows = await redis_client.lrange(EVENTS_LOG, 0, max(limit - 1, 0))
        events = [json.loads(row) for row in rows]
    except RedisError:
        events = [_salin_nilai(row) for row in _fallback_events[: max(limit, 0)]]

    events.reverse()

    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            if since_dt.tzinfo is None:
                since_dt = since_dt.replace(tzinfo=timezone.utc)
            events = [
                event
                for event in events
                if datetime.fromisoformat(event.get("timestamp", _sekarang_iso()).replace("Z", "+00:00")).astimezone(timezone.utc)
                > since_dt.astimezone(timezone.utc)
            ]
        except ValueError:
            pass

    if len(events) > limit:
        return events[-limit:]
    return events
