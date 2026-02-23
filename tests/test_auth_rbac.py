from app.core.auth import (
    ROLE_ADMIN,
    ROLE_OPERATOR,
    ROLE_VIEWER,
    extract_auth_token,
    parse_token_roles_from_env,
    resolve_required_role,
    role_memenuhi,
)


def test_parse_token_roles_from_env_supports_single_and_pairs(monkeypatch):
    monkeypatch.setenv("AUTH_VIEWER_TOKEN", "tok-view")
    monkeypatch.setenv("AUTH_OPERATOR_TOKEN", "tok-op")
    monkeypatch.setenv("AUTH_ADMIN_TOKEN", "tok-admin")
    monkeypatch.setenv("AUTH_API_KEYS", "extra1:viewer, extra2:operator,extra3:admin")

    mapping = parse_token_roles_from_env()
    assert mapping["tok-view"] == ROLE_VIEWER
    assert mapping["tok-op"] == ROLE_OPERATOR
    assert mapping["tok-admin"] == ROLE_ADMIN
    assert mapping["extra1"] == ROLE_VIEWER
    assert mapping["extra2"] == ROLE_OPERATOR
    assert mapping["extra3"] == ROLE_ADMIN


def test_extract_auth_token_from_authorization_bearer():
    headers = {"Authorization": "Bearer abc123"}
    token = extract_auth_token(headers, "Authorization", "Bearer")
    assert token == "abc123"


def test_extract_auth_token_uses_x_api_key_fallback():
    headers = {"X-API-Key": "apikey-xyz"}
    token = extract_auth_token(headers, "Authorization", "Bearer")
    assert token == "apikey-xyz"


def test_resolve_required_role_for_public_and_read_endpoints():
    assert resolve_required_role("/healthz", "GET") == ""
    assert resolve_required_role("/readyz", "GET") == ""
    assert resolve_required_role("/metrics", "GET") == ""
    assert resolve_required_role("/jobs", "GET") == ROLE_VIEWER


def test_resolve_required_role_for_write_endpoints():
    assert resolve_required_role("/jobs", "POST") == ROLE_OPERATOR
    assert resolve_required_role("/jobs/abc/enable", "PUT") == ROLE_OPERATOR


def test_resolve_required_role_for_admin_endpoints():
    assert resolve_required_role("/jobs/job_a/rollback/v_123", "POST") == ROLE_ADMIN
    assert resolve_required_role("/approvals/apr_123/approve", "POST") == ROLE_ADMIN
    assert resolve_required_role("/approvals/apr_123/reject", "POST") == ROLE_ADMIN
    assert resolve_required_role("/integrations/accounts/openai/default", "PUT") == ROLE_ADMIN
    assert resolve_required_role("/integrations/mcp/servers/mcp_main", "DELETE") == ROLE_ADMIN
    assert resolve_required_role("/integrations/catalog/bootstrap", "POST") == ROLE_ADMIN
    assert resolve_required_role("/agents/memory/flow_a", "DELETE") == ROLE_ADMIN


def test_role_memenuhi_hierarchy():
    assert role_memenuhi(ROLE_VIEWER, ROLE_VIEWER) is True
    assert role_memenuhi(ROLE_VIEWER, ROLE_OPERATOR) is True
    assert role_memenuhi(ROLE_VIEWER, ROLE_ADMIN) is True
    assert role_memenuhi(ROLE_OPERATOR, ROLE_VIEWER) is False
    assert role_memenuhi(ROLE_ADMIN, ROLE_OPERATOR) is False
    assert role_memenuhi(ROLE_ADMIN, ROLE_ADMIN) is True
