import asyncio

from app.core import runner


class _LoggerStub:
    def warning(self, *args, **kwargs):
        return None

    def error(self, *args, **kwargs):
        return None


async def _noop(*args, **kwargs):
    return None


def test_process_job_event_creates_approval_when_handler_requires_it(monkeypatch):
    async def fake_get_run(run_id: str):
        return None

    events = []
    create_calls = []

    async def fake_append_event(event_type: str, data):
        events.append((event_type, data))
        return {"event_type": event_type, "data": data}

    async def fake_create_approval_request(**kwargs):
        create_calls.append(kwargs)
        return {"approval_id": "apr_test_1"}, True

    async def fake_handler(ctx, inputs):
        return {
            "success": False,
            "requires_approval": True,
            "summary": "Perlu izin resource tambahan",
            "prompt": str(inputs.get("prompt") or ""),
            "approval_requests": [
                {"kind": "provider_account", "provider": "openai", "account_id": "default"},
            ],
            "available_providers": {},
            "available_mcp_servers": [],
        }

    monkeypatch.setattr(runner, "get_run", fake_get_run)
    monkeypatch.setattr(runner, "save_run", _noop)
    monkeypatch.setattr(runner, "add_run_to_job_history", _noop)
    monkeypatch.setattr(runner, "append_event", fake_append_event)
    monkeypatch.setattr(runner, "create_approval_request", fake_create_approval_request)

    result = asyncio.run(
        runner.process_job_event(
            event_data={
                "run_id": "run_approval_1",
                "job_id": "job_approval_1",
                "type": "agent.workflow",
                "inputs": {"prompt": "cek trend terbaru"},
                "attempt": 0,
                "scheduled_at": "2026-01-01T00:00:00+00:00",
                "timeout_ms": 30000,
            },
            worker_id="worker_test",
            handler_registry={"agent.workflow": fake_handler},
            tools={},
            logger=_LoggerStub(),
            metrics=None,
        )
    )

    assert result is False
    assert len(create_calls) == 1
    assert create_calls[0]["run_id"] == "run_approval_1"
    assert create_calls[0]["job_id"] == "job_approval_1"
    assert "approval.request_created" in {name for name, _ in events}
