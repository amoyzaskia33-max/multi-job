import asyncio

from app.jobs.handlers import agent_workflow


class _FakeHttpTool:
    def __init__(self):
        self.calls = []

    async def run(self, input_data, ctx):
        self.calls.append(input_data)
        return {"success": True, "status": 200, "body": '{"ok":true}'}


class _Ctx:
    def __init__(self, http_tool):
        self.tools = {"http": http_tool}


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

    async def fake_plan_actions_with_openai(prompt, model_id, api_key, provider_catalog, mcp_catalog):
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
    monkeypatch.setenv("OPENAI_API_KEY", "")

    http_tool = _FakeHttpTool()
    result = asyncio.run(agent_workflow.run(_Ctx(http_tool), {"prompt": "cek github"}))
    assert result["success"] is False
    assert "OpenAI API key" in result["error"]
