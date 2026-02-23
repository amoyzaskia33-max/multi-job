from app.core.audit import (
    AUDIT_EVENT_TYPE,
    audit_outcome_from_status,
    build_audit_payload,
    event_to_audit_row,
    is_mutating_method,
)


def test_is_mutating_method_detects_write_methods():
    assert is_mutating_method("POST") is True
    assert is_mutating_method("put") is True
    assert is_mutating_method("DELETE") is True
    assert is_mutating_method("GET") is False


def test_audit_outcome_from_status_maps_values():
    assert audit_outcome_from_status(200) == "success"
    assert audit_outcome_from_status(302) == "success"
    assert audit_outcome_from_status(401) == "denied"
    assert audit_outcome_from_status(403) == "denied"
    assert audit_outcome_from_status(500) == "error"


def test_build_audit_payload_uses_auth_context_and_truncates_detail():
    payload = build_audit_payload(
        method="POST",
        path="/jobs",
        status_code=403,
        required_role="admin",
        auth_ctx={"enabled": True, "role": "operator", "subject": "operator_token_very_long"},
        query="page=1&limit=10",
        detail="x" * 1000,
        client_ip="127.0.0.1",
    )

    assert payload["method"] == "POST"
    assert payload["path"] == "/jobs"
    assert payload["status_code"] == 403
    assert payload["outcome"] == "denied"
    assert payload["required_role"] == "admin"
    assert payload["actor_role"] == "operator"
    assert payload["auth_enabled"] is True
    assert payload["client_ip"] == "127.0.0.1"
    assert len(payload["detail"]) <= 300


def test_event_to_audit_row_only_accepts_audit_event_type():
    non_audit = {
        "id": "evt_1",
        "type": "run.started",
        "timestamp": "2026-02-23T00:00:00+00:00",
        "data": {"foo": "bar"},
    }
    assert event_to_audit_row(non_audit) is None

    audit_event = {
        "id": "evt_2",
        "type": AUDIT_EVENT_TYPE,
        "timestamp": "2026-02-23T00:00:00+00:00",
        "data": {
            "method": "PUT",
            "path": "/jobs/x/enable",
            "status_code": 200,
            "outcome": "success",
            "required_role": "operator",
            "actor_role": "admin",
            "actor_subject": "abc***",
            "auth_enabled": True,
            "query": "",
            "detail": "",
            "client_ip": "127.0.0.1",
        },
    }
    row = event_to_audit_row(audit_event)
    assert row is not None
    assert row["method"] == "PUT"
    assert row["path"] == "/jobs/x/enable"
    assert row["outcome"] == "success"
