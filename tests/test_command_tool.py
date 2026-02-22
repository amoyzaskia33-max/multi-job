import asyncio

from app.core.tools.command import CommandTool


class _FakeProcess:
    def __init__(self, returncode: int = 0, stdout: bytes = b"", stderr: bytes = b""):
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self):
        return self._stdout, self._stderr

    def kill(self):
        self.returncode = -9


async def _fake_create_subprocess_shell(*args, **kwargs):
    return _FakeProcess(returncode=0, stdout=b"ok\n", stderr=b"")


def test_command_tool_executes_allowed_command(monkeypatch):
    monkeypatch.setattr(
        "app.core.tools.command.asyncio.create_subprocess_shell",
        _fake_create_subprocess_shell,
    )
    tool = CommandTool()
    result = asyncio.run(
        tool.run(
            {
                "command": "pytest -q",
                "allow_prefixes": ["pytest"],
                "timeout_sec": 20,
            },
            ctx=None,
        )
    )
    assert result["success"] is True
    assert result["exit_code"] == 0
    assert "ok" in result.get("stdout", "")


def test_command_tool_rejects_non_allowlisted_command():
    tool = CommandTool()
    result = asyncio.run(
        tool.run(
            {
                "command": "echo halo",
                "allow_prefixes": ["pytest"],
            },
            ctx=None,
        )
    )
    assert result["success"] is False
    assert "allowlist" in str(result.get("error", "")).lower()


def test_command_tool_rejects_shell_operator_without_flag():
    tool = CommandTool()
    result = asyncio.run(
        tool.run(
            {
                "command": "pytest -q && echo halo",
                "allow_prefixes": ["pytest -q"],
                "allow_sensitive": False,
            },
            ctx=None,
        )
    )
    assert result["success"] is False
    assert "operator shell" in str(result.get("error", "")).lower()


def test_command_tool_rejects_workdir_outside_allowed_roots(tmp_path):
    allowed_root = tmp_path / "allowed"
    disallowed_root = tmp_path / "outside"
    allowed_root.mkdir(parents=True, exist_ok=True)
    disallowed_root.mkdir(parents=True, exist_ok=True)

    tool = CommandTool()
    result = asyncio.run(
        tool.run(
            {
                "command": "pytest -q",
                "allow_prefixes": ["pytest -q"],
                "workdir": str(disallowed_root),
                "allowed_workdir_roots": [str(allowed_root)],
            },
            ctx=None,
        )
    )
    assert result["success"] is False
    assert "workdir di luar batas" in str(result.get("error", "")).lower()


def test_command_tool_rejects_sensitive_command_without_flag():
    tool = CommandTool()
    result = asyncio.run(
        tool.run(
            {
                "command": "git push origin main",
                "allow_prefixes": ["git push"],
                "allow_sensitive": False,
            },
            ctx=None,
        )
    )
    assert result["success"] is False
    assert "sensitif" in str(result.get("error", "")).lower()
