import asyncio

from app.jobs.handlers import simulation_heavy


class _MetricsStub:
    def __init__(self):
        self.increment_calls = []
        self.observe_calls = []

    def increment(self, name: str, tags=None):
        self.increment_calls.append((name, tags or {}))

    def observe(self, name: str, value, tags=None):
        self.observe_calls.append((name, value, tags or {}))


class _Ctx:
    def __init__(self):
        self.job_id = "sim_job_1"
        self.run_id = "sim_run_1"
        self.metrics = _MetricsStub()


def test_simulation_heavy_handler_returns_success():
    ctx = _Ctx()
    result = asyncio.run(simulation_heavy.run(ctx, {"work_ms": 150, "payload_kb": 1}))

    assert result["success"] is True
    assert result["job_id"] == "sim_job_1"
    assert result["run_id"] == "sim_run_1"
    assert result["work_ms"] == 150
    assert result["payload_kb"] == 1
    assert result["payload_echo_size"] == 1024

    assert len(ctx.metrics.increment_calls) == 1
    assert len(ctx.metrics.observe_calls) == 1
