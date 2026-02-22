import asyncio

from app.jobs.handlers import agent_workflow


class _FakeHttpTool:
    def __init__(self):
        self.calls = []

    async def run(self, input_data, ctx):
        self.calls.append(input_data)
        return {"success": True, "status": 200, "body": '{"ok":true}'}


class _Ctx:
    def __init__(self, http_tool, command_tool=None):
        self.tools = {"http": http_tool}
        if command_tool:
            self.tools["command"] = command_tool


class _FakeCommandTool:
    def __init__(self):
        self.calls = []

    async def run(self, input_data, ctx):
        self.calls.append(input_data)
        return {
            "success": True,
            "exit_code": 0,
            "stdout": "ok",
            "stderr": "",
            "duration_ms": 120,
            "workdir": input_data.get("workdir") or ".",
        }


async def _noop_append_event(*args, **kwargs):
    return None


async def _noop_list_approvals(*args, **kwargs):
    return []


def test_agent_workflow_requires_prompt():
    http_tool = _FakeHttpTool()
    result = asyncio.run(agent_workflow.run(_Ctx(http_tool), {}))
    assert result["success"] is False
    assert "prompt" in result["error"]


def test_agent_workflow_executes_provider_and_mcp_steps(monkeypatch):
    async def fake_list_accounts(include_secret: bool = False):
        return [
            {
                "provider": "openai",
                "account_id": "default",
                "enabled": True,
                "secret": "sk-openai",
                "config": {"model_id": "gpt-4o-mini"},
            },
            {
                "provider": "github",
                "account_id": "default",
                "enabled": True,
                "secret": "ghp-123",
                "config": {"base_url": "https://api.github.com"},
            },
        ]

    async def fake_list_mcp_servers(include_secret: bool = False):
        return [
            {
                "server_id": "mcp_main",
                "enabled": True,
                "transport": "http",
                "url": "https://mcp.example.com",
                "headers": {},
                "auth_token": "mcp-secret",
                "timeout_sec": 20,
            }
        ]

    async def fake_plan_actions_with_openai(
        prompt,
        model_id,
        api_key,
        provider_catalog,
        mcp_catalog,
        command_allow_prefixes,
        allow_sensitive_commands,
    ):
        return {
            "summary": "Plan siap",
            "steps": [
                {"kind": "provider_http", "provider": "github", "account_id": "default", "method": "GET", "path": "/user"},
                {"kind": "mcp_http", "server_id": "mcp_main", "method": "GET", "path": "/health"},
                {"kind": "note", "text": "Selesai"},
            ],
            "final_message": "ok",
        }

    monkeypatch.setattr(agent_workflow, "list_integration_accounts", fake_list_accounts)
    monkeypatch.setattr(agent_workflow, "list_mcp_servers", fake_list_mcp_servers)
    monkeypatch.setattr(agent_workflow, "_rencanakan_aksi_dengan_openai", fake_plan_actions_with_openai)
    monkeypatch.setattr(agent_workflow, "append_event", _noop_append_event)
    monkeypatch.setattr(agent_workflow, "list_approval_requests", _noop_list_approvals)

    http_tool = _FakeHttpTool()
    result = asyncio.run(
        agent_workflow.run(
            _Ctx(http_tool),
            {"prompt": "cek github lalu ping mcp"},
        )
    )

    assert result["success"] is True
    assert result["steps_executed"] == 3
    assert len(http_tool.calls) == 2
    assert http_tool.calls[0]["url"] == "https://api.github.com/user"
    assert http_tool.calls[1]["url"] == "https://mcp.example.com/health"


def test_agent_workflow_fails_when_openai_key_missing(monkeypatch):
    async def fake_list_accounts(include_secret: bool = False):
        return [
            {
                "provider": "github",
                "account_id": "default",
                "enabled": True,
                "secret": "ghp-123",
                "config": {"base_url": "https://api.github.com"},
            }
        ]

    async def fake_list_mcp_servers(include_secret: bool = False):
        return []

    monkeypatch.setattr(agent_workflow, "list_integration_accounts", fake_list_accounts)
    monkeypatch.setattr(agent_workflow, "list_mcp_servers", fake_list_mcp_servers)
    monkeypatch.setattr(agent_workflow, "append_event", _noop_append_event)
    monkeypatch.setattr(agent_workflow, "list_approval_requests", _noop_list_approvals)
    monkeypatch.setenv("OPENAI_API_KEY", "")

    http_tool = _FakeHttpTool()
    result = asyncio.run(agent_workflow.run(_Ctx(http_tool), {"prompt": "cek github"}))
    assert result["success"] is False
    assert result.get("requires_approval") is True
    assert len(result.get("approval_requests", [])) == 1
    assert result["approval_requests"][0]["provider"] == "openai"


def test_agent_workflow_memori_diperbarui_dan_tidak_double_record_saat_openai_missing(monkeypatch):
    state = {
        "agent_key": "tim-wa",
        "total_runs": 0,
        "success_runs": 0,
        "failed_runs": 0,
        "last_error": None,
        "last_summary": "",
        "failure_signatures": {},
        "avoid_signatures": [],
        "run_history": [],
        "recent_failures": [],
        "recent_successes": [],
        "updated_at": "2026-01-01T00:00:00+00:00",
    }
    calls = {"record": 0}

    async def fake_list_accounts(include_secret: bool = False):
        return []

    async def fake_list_mcp_servers(include_secret: bool = False):
        return []

    async def fake_get_agent_memory(agent_key: str):
        row = dict(state)
        row["agent_key"] = agent_key
        return row

    async def fake_record_agent_workflow_outcome(**kwargs):
        calls["record"] += 1
        state["total_runs"] = int(state["total_runs"]) + 1
        state["failed_runs"] = int(state["failed_runs"]) + 1
        state["last_error"] = str(kwargs.get("error") or "")
        state["updated_at"] = "2026-01-01T00:01:00+00:00"
        return dict(state)

    monkeypatch.setattr(agent_workflow, "list_integration_accounts", fake_list_accounts)
    monkeypatch.setattr(agent_workflow, "list_mcp_servers", fake_list_mcp_servers)
    monkeypatch.setattr(agent_workflow, "get_agent_memory", fake_get_agent_memory)
    monkeypatch.setattr(agent_workflow, "record_agent_workflow_outcome", fake_record_agent_workflow_outcome)
    monkeypatch.setattr(agent_workflow, "append_event", _noop_append_event)
    monkeypatch.setattr(agent_workflow, "list_approval_requests", _noop_list_approvals)
    monkeypatch.setenv("OPENAI_API_KEY", "")

    http_tool = _FakeHttpTool()
    result = asyncio.run(
        agent_workflow.run(
            _Ctx(http_tool),
            {
                "prompt": "cek konektor",
                "flow_group": "tim-wa",
                "require_approval_for_missing": False,
            },
        )
    )

    assert result["success"] is False
    assert calls["record"] == 1
    assert result["memory_context"]["total_runs"] == 1
    assert result["memory_context"]["failed_runs"] == 1
    assert result["memory_context"]["last_error"] == "openai_api_key_missing"


def test_agent_workflow_requests_approval_when_provider_or_mcp_missing(monkeypatch):
    async def fake_list_accounts(include_secret: bool = False):
        return [
            {
                "provider": "openai",
                "account_id": "default",
                "enabled": True,
                "secret": "sk-openai",
                "config": {"model_id": "gpt-4o-mini"},
            }
        ]

    async def fake_list_mcp_servers(include_secret: bool = False):
        return []

    async def fake_plan_actions_with_openai(
        prompt,
        model_id,
        api_key,
        provider_catalog,
        mcp_catalog,
        command_allow_prefixes,
        allow_sensitive_commands,
    ):
        return {
            "summary": "Rencana cek provider dan mcp",
            "steps": [
                {"kind": "provider_http", "provider": "github", "account_id": "default", "method": "GET", "path": "/user"},
                {"kind": "mcp_http", "server_id": "mcp_main", "method": "GET", "path": "/health"},
            ],
            "final_message": "ok",
        }

    monkeypatch.setattr(agent_workflow, "list_integration_accounts", fake_list_accounts)
    monkeypatch.setattr(agent_workflow, "list_mcp_servers", fake_list_mcp_servers)
    monkeypatch.setattr(agent_workflow, "_rencanakan_aksi_dengan_openai", fake_plan_actions_with_openai)
    monkeypatch.setattr(agent_workflow, "append_event", _noop_append_event)
    monkeypatch.setattr(agent_workflow, "list_approval_requests", _noop_list_approvals)

    http_tool = _FakeHttpTool()
    result = asyncio.run(agent_workflow.run(_Ctx(http_tool), {"prompt": "cek github dan mcp"}))

    assert result["success"] is False
    assert result.get("requires_approval") is True
    assert len(result.get("approval_requests", [])) == 2
    assert http_tool.calls == []


def test_agent_workflow_executes_local_command_step(monkeypatch):
    async def fake_list_accounts(include_secret: bool = False):
        return [
            {
                "provider": "openai",
                "account_id": "default",
                "enabled": True,
                "secret": "sk-openai",
                "config": {"model_id": "gpt-4o-mini"},
            }
        ]

    async def fake_list_mcp_servers(include_secret: bool = False):
        return []

    async def fake_plan_actions_with_openai(
        prompt,
        model_id,
        api_key,
        provider_catalog,
        mcp_catalog,
        command_allow_prefixes,
        allow_sensitive_commands,
    ):
        return {
            "summary": "Rencana tes lokal",
            "steps": [
                {"kind": "local_command", "command": "pytest -q", "workdir": ".", "timeout_sec": 120},
                {"kind": "note", "text": "Selesai"},
            ],
            "final_message": "ok",
        }

    monkeypatch.setattr(agent_workflow, "list_integration_accounts", fake_list_accounts)
    monkeypatch.setattr(agent_workflow, "list_mcp_servers", fake_list_mcp_servers)
    monkeypatch.setattr(agent_workflow, "_rencanakan_aksi_dengan_openai", fake_plan_actions_with_openai)
    monkeypatch.setattr(agent_workflow, "append_event", _noop_append_event)
    monkeypatch.setattr(agent_workflow, "list_approval_requests", _noop_list_approvals)

    http_tool = _FakeHttpTool()
    command_tool = _FakeCommandTool()
    result = asyncio.run(
        agent_workflow.run(
            _Ctx(http_tool, command_tool=command_tool),
            {"prompt": "jalankan test lokal"},
        )
    )

    assert result["success"] is True
    assert result["steps_executed"] == 2
    assert len(command_tool.calls) == 1
    assert command_tool.calls[0]["command"] == "pytest -q"


def test_agent_workflow_requests_approval_for_sensitive_command(monkeypatch):
    async def fake_list_accounts(include_secret: bool = False):
        return [
            {
                "provider": "openai",
                "account_id": "default",
                "enabled": True,
                "secret": "sk-openai",
                "config": {"model_id": "gpt-4o-mini"},
            }
        ]

    async def fake_list_mcp_servers(include_secret: bool = False):
        return []

    async def fake_plan_actions_with_openai(
        prompt,
        model_id,
        api_key,
        provider_catalog,
        mcp_catalog,
        command_allow_prefixes,
        allow_sensitive_commands,
    ):
        return {
            "summary": "Rencana deploy",
            "steps": [
                {"kind": "local_command", "command": "git push origin main", "workdir": ".", "timeout_sec": 120},
            ],
            "final_message": "ok",
        }

    monkeypatch.setattr(agent_workflow, "list_integration_accounts", fake_list_accounts)
    monkeypatch.setattr(agent_workflow, "list_mcp_servers", fake_list_mcp_servers)
    monkeypatch.setattr(agent_workflow, "_rencanakan_aksi_dengan_openai", fake_plan_actions_with_openai)
    monkeypatch.setattr(agent_workflow, "append_event", _noop_append_event)
    monkeypatch.setattr(agent_workflow, "list_approval_requests", _noop_list_approvals)

    http_tool = _FakeHttpTool()
    result = asyncio.run(agent_workflow.run(_Ctx(http_tool), {"prompt": "deploy sekarang"}))

    assert result["success"] is False
    assert result.get("requires_approval") is True
    assert any(item.get("kind") == "command_sensitive" for item in result.get("approval_requests", []))


def test_agent_workflow_requests_approval_for_command_prefix_extension(monkeypatch):
    async def fake_list_accounts(include_secret: bool = False):
        return [
            {
                "provider": "openai",
                "account_id": "default",
                "enabled": True,
                "secret": "sk-openai",
                "config": {"model_id": "gpt-4o-mini"},
            }
        ]

    async def fake_list_mcp_servers(include_secret: bool = False):
        return []

    async def planner_should_not_run(**kwargs):
        raise AssertionError("planner should not run when command prefix extension requires approval")

    monkeypatch.setattr(agent_workflow, "list_integration_accounts", fake_list_accounts)
    monkeypatch.setattr(agent_workflow, "list_mcp_servers", fake_list_mcp_servers)
    monkeypatch.setattr(agent_workflow, "_rencanakan_aksi_dengan_openai", planner_should_not_run)
    monkeypatch.setattr(agent_workflow, "append_event", _noop_append_event)
    monkeypatch.setattr(agent_workflow, "list_approval_requests", _noop_list_approvals)

    http_tool = _FakeHttpTool()
    result = asyncio.run(
        agent_workflow.run(
            _Ctx(http_tool),
            {
                "prompt": "jalankan cek",
                "command_allow_prefixes": ["git status"],
            },
        )
    )

    assert result["success"] is False
    assert result.get("requires_approval") is True
    assert any(item.get("kind") == "command_prefix" for item in result.get("approval_requests", []))
    assert any(item.get("command") == "git status" for item in result.get("approval_requests", []))


def test_agent_workflow_sanitizes_requested_prefix_subset_when_approval_disabled(monkeypatch):
    async def fake_list_accounts(include_secret: bool = False):
        return [
            {
                "provider": "openai",
                "account_id": "default",
                "enabled": True,
                "secret": "sk-openai",
                "config": {"model_id": "gpt-4o-mini"},
            }
        ]

    async def fake_list_mcp_servers(include_secret: bool = False):
        return []

    async def fake_plan_actions_with_openai(
        prompt,
        model_id,
        api_key,
        provider_catalog,
        mcp_catalog,
        command_allow_prefixes,
        allow_sensitive_commands,
    ):
        return {
            "summary": "Rencana tes subset prefix",
            "steps": [
                {"kind": "local_command", "command": "pytest -q", "workdir": ".", "timeout_sec": 120},
            ],
            "final_message": "ok",
        }

    monkeypatch.setattr(agent_workflow, "list_integration_accounts", fake_list_accounts)
    monkeypatch.setattr(agent_workflow, "list_mcp_servers", fake_list_mcp_servers)
    monkeypatch.setattr(agent_workflow, "_rencanakan_aksi_dengan_openai", fake_plan_actions_with_openai)
    monkeypatch.setattr(agent_workflow, "append_event", _noop_append_event)
    monkeypatch.setattr(agent_workflow, "list_approval_requests", _noop_list_approvals)

    http_tool = _FakeHttpTool()
    command_tool = _FakeCommandTool()
    result = asyncio.run(
        agent_workflow.run(
            _Ctx(http_tool, command_tool=command_tool),
            {
                "prompt": "jalankan test lokal",
                "command_allow_prefixes": ["pytest -q", "git status"],
                "require_approval_for_missing": False,
            },
        )
    )

    assert result["success"] is True
    assert len(command_tool.calls) == 1
    assert command_tool.calls[0]["allow_prefixes"] == ["pytest -q"]
    assert result["command_allow_prefixes_requested"] == ["pytest -q", "git status"]
    assert result["command_allow_prefixes_rejected"] == ["git status"]
