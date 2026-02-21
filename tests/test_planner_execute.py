import asyncio
from datetime import datetime, timezone

from app.core.models import JobSpec, RetryPolicy, Run, RunResult, RunStatus, Schedule
from app.services.api import planner_execute
from app.services.api.planner import PlannerJob, PlannerResponse


def _make_job_spec(job_id: str, job_type: str = "monitor.channel") -> JobSpec:
    if job_type == "monitor.channel":
        return JobSpec(
            job_id=job_id,
            type=job_type,
            schedule=Schedule(interval_sec=30),
            timeout_ms=15000,
            retry_policy=RetryPolicy(max_retry=1, backoff_sec=[1]),
            inputs={"channel": "telegram", "account_id": "bot_a01", "source": "test"},
        )

    return JobSpec(
        job_id=job_id,
        type=job_type,
        schedule=Schedule(cron="0 7 * * *"),
        timeout_ms=45000,
        retry_policy=RetryPolicy(max_retry=1, backoff_sec=[1]),
        inputs={"timezone": "Asia/Jakarta", "source": "test"},
    )


def _make_plan(job_specs: list[JobSpec], planner_source: str = "rule_based") -> PlannerResponse:
    return PlannerResponse(
        prompt="abc",
        normalized_prompt="abc",
        summary=f"Generated {len(job_specs)} jobs.",
        planner_source=planner_source,
        assumptions=[],
        warnings=[],
        jobs=[PlannerJob(reason="test", assumptions=[], warnings=[], job_spec=spec) for spec in job_specs],
    )


def test_execute_prompt_plan_creates_and_runs_job(monkeypatch):
    plan = _make_plan([_make_job_spec("monitor-1")])

    async def fake_get_job_spec(job_id: str):
        return None

    async def fake_save_job_spec(job_id: str, spec):
        return None

    async def fake_enable_job(job_id: str):
        return None

    async def fake_append_event(event_type: str, data):
        return None

    async def fake_enqueue_run_from_spec(job_id: str, spec):
        return {"run_id": "run_test_1", "status": "queued"}

    async def fake_sleep(seconds: float):
        return None

    async def fake_get_run(run_id: str):
        return Run(
            run_id=run_id,
            job_id="monitor-1",
            status=RunStatus.SUCCESS,
            attempt=0,
            scheduled_at=datetime.now(timezone.utc),
            inputs={},
            result=RunResult(success=True),
        )

    monkeypatch.setattr(planner_execute, "build_plan_from_prompt", lambda request: plan)
    monkeypatch.setattr(planner_execute, "get_job_spec", fake_get_job_spec)
    monkeypatch.setattr(planner_execute, "save_job_spec", fake_save_job_spec)
    monkeypatch.setattr(planner_execute, "enable_job", fake_enable_job)
    monkeypatch.setattr(planner_execute, "append_event", fake_append_event)
    monkeypatch.setattr(planner_execute, "_antrikan_run_dari_spesifikasi", fake_enqueue_run_from_spec)
    monkeypatch.setattr(planner_execute, "get_run", fake_get_run)
    monkeypatch.setattr(planner_execute.asyncio, "sleep", fake_sleep)

    result = asyncio.run(
        planner_execute.execute_prompt_plan(
            planner_execute.PlannerExecuteRequest(
                prompt="abc",
                use_ai=False,
                run_immediately=True,
                wait_seconds=2,
            )
        )
    )

    assert result.planner_source == "rule_based"
    assert len(result.results) == 1
    assert result.results[0].create_status == "created"
    assert result.results[0].run_id == "run_test_1"
    assert result.results[0].queue_status == "queued"
    assert result.results[0].run_status == "success"
    assert result.results[0].result_success is True


def test_execute_prompt_plan_updates_existing_job_without_run(monkeypatch):
    plan = _make_plan([_make_job_spec("monitor-1")])

    async def fake_get_job_spec(job_id: str):
        return {"job_id": job_id}

    async def fake_save_job_spec(job_id: str, spec):
        return None

    async def fake_enable_job(job_id: str):
        return None

    async def fake_append_event(event_type: str, data):
        return None

    async def should_not_enqueue(job_id: str, spec):
        raise AssertionError("enqueue must not be called when run_immediately is false")

    monkeypatch.setattr(planner_execute, "build_plan_from_prompt", lambda request: plan)
    monkeypatch.setattr(planner_execute, "get_job_spec", fake_get_job_spec)
    monkeypatch.setattr(planner_execute, "save_job_spec", fake_save_job_spec)
    monkeypatch.setattr(planner_execute, "enable_job", fake_enable_job)
    monkeypatch.setattr(planner_execute, "append_event", fake_append_event)
    monkeypatch.setattr(planner_execute, "_antrikan_run_dari_spesifikasi", should_not_enqueue)

    result = asyncio.run(
        planner_execute.execute_prompt_plan(
            planner_execute.PlannerExecuteRequest(
                prompt="abc",
                use_ai=False,
                run_immediately=False,
            )
        )
    )

    assert len(result.results) == 1
    assert result.results[0].create_status == "updated"
    assert result.results[0].run_id is None
    assert result.results[0].queue_status is None


def test_execute_prompt_plan_keeps_processing_when_single_job_fails(monkeypatch):
    plan = _make_plan(
        [
            _make_job_spec("monitor-ok"),
            _make_job_spec("report-fail", job_type="report.daily"),
        ]
    )

    async def fake_get_job_spec(job_id: str):
        return None

    async def fake_save_job_spec(job_id: str, spec):
        if job_id == "report-fail":
            raise RuntimeError("simulated write failure")
        return None

    async def fake_enable_job(job_id: str):
        return None

    async def fake_append_event(event_type: str, data):
        return None

    async def should_not_enqueue(job_id: str, spec):
        raise AssertionError("enqueue must not be called when run_immediately is false")

    monkeypatch.setattr(planner_execute, "build_plan_from_prompt", lambda request: plan)
    monkeypatch.setattr(planner_execute, "get_job_spec", fake_get_job_spec)
    monkeypatch.setattr(planner_execute, "save_job_spec", fake_save_job_spec)
    monkeypatch.setattr(planner_execute, "enable_job", fake_enable_job)
    monkeypatch.setattr(planner_execute, "append_event", fake_append_event)
    monkeypatch.setattr(planner_execute, "_antrikan_run_dari_spesifikasi", should_not_enqueue)

    result = asyncio.run(
        planner_execute.execute_prompt_plan(
            planner_execute.PlannerExecuteRequest(
                prompt="abc",
                use_ai=False,
                run_immediately=False,
            )
        )
    )

    assert len(result.results) == 2
    assert result.results[0].job_id == "monitor-ok"
    assert result.results[0].create_status == "created"
    assert result.results[1].job_id == "report-fail"
    assert result.results[1].create_status == "error"
    assert "simulated write failure" in (result.results[1].result_error or "")


def test_execute_prompt_plan_uses_ai_planner_when_enabled(monkeypatch):
    plan = _make_plan([_make_job_spec("monitor-ai")], planner_source="smolagents")

    async def fake_get_job_spec(job_id: str):
        return None

    async def fake_save_job_spec(job_id: str, spec):
        return None

    async def fake_enable_job(job_id: str):
        return None

    async def fake_append_event(event_type: str, data):
        return None

    async def should_not_enqueue(job_id: str, spec):
        raise AssertionError("enqueue must not be called when run_immediately is false")

    def should_not_use_rule_builder(request):
        raise AssertionError("rule-based planner must not be called when use_ai is true")

    monkeypatch.setattr(planner_execute, "build_plan_with_ai", lambda request: plan)
    monkeypatch.setattr(planner_execute, "build_plan_from_prompt", should_not_use_rule_builder)
    monkeypatch.setattr(planner_execute, "get_job_spec", fake_get_job_spec)
    monkeypatch.setattr(planner_execute, "save_job_spec", fake_save_job_spec)
    monkeypatch.setattr(planner_execute, "enable_job", fake_enable_job)
    monkeypatch.setattr(planner_execute, "append_event", fake_append_event)
    monkeypatch.setattr(planner_execute, "_antrikan_run_dari_spesifikasi", should_not_enqueue)

    result = asyncio.run(
        planner_execute.execute_prompt_plan(
            planner_execute.PlannerExecuteRequest(
                prompt="abc",
                use_ai=True,
                run_immediately=False,
            )
        )
    )

    assert result.planner_source == "smolagents"
    assert len(result.results) == 1
    assert result.results[0].job_id == "monitor-ai"
