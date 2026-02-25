import asyncio

import pytest

from fastapi import HTTPException

from app.services.api.main import (
    ConnectorEmailRequest,
    ConnectorSlackRequest,
    ConnectorSmsRequest,
    ConnectorTelegramRequest,
    ConnectorVoiceRequest,
    ConnectorWebhookRequest,
    connector_email,
    connector_slack,
    connector_sms,
    connector_telegram,
    connector_voice,
    connector_webhook,
)
from app.services.api.main import ConnectorSlackRequest, ConnectorSmsRequest, connector_slack, connector_sms


class _FakeRequest:
    def __init__(self, headers):
        self.headers = headers


def _setup_trigger(monkeypatch, channel: str):
    async def fake_get_trigger(trigger_id: str):
        return {
            "trigger_id": trigger_id,
            "channel": channel,
            "job_id": "job_alert",
            "enabled": True,
        }

    monkeypatch.setattr("app.services.api.main.get_trigger", fake_get_trigger)


def _fire_stub(captured: dict, expected_source: str, require_auth: bool = True):
    async def stub(trigger_id: str, payload: dict, source: str, auth_token: str | None = None):
        captured["trigger_id"] = trigger_id
        captured["payload"] = payload
        captured["source"] = source
        captured["auth_token"] = auth_token
        if require_auth and not auth_token:
            raise ValueError("Auth token tidak valid.")
        if source != expected_source:
            raise ValueError("Source mismatch")
        return {
            "message_id": "msg-123",
            "run_id": "run-123",
            "job_id": "job_alert",
            "channel": "webhook",
        }

    return stub


def test_webhook_connector_requires_secret(monkeypatch):
    _setup_trigger(monkeypatch, "webhook")

    async def fail_without_auth(trigger_id: str, payload: dict, source: str, auth_token: str | None = None):
        if not auth_token:
            raise ValueError("Auth token tidak valid.")
        return {
            "message_id": "msg-123",
            "run_id": "run-123",
            "job_id": "job_alert",
            "channel": "webhook",
        }

    monkeypatch.setattr("app.services.api.main.fire_trigger", fail_without_auth)

    with pytest.raises(HTTPException):
        asyncio.run(
            connector_webhook("alert-webhook", ConnectorWebhookRequest(payload={}), _FakeRequest({}))
        )

    result = asyncio.run(
        connector_webhook(
            "alert-webhook",
            ConnectorWebhookRequest(payload={"foo": "bar"}),
            _FakeRequest({"x-trigger-auth": "secret"}),
        )
    )
    assert result["channel"] == "webhook"
    assert result["job_id"] == "job_alert"


def test_telegram_connector_payload(monkeypatch):
    _setup_trigger(monkeypatch, "telegram")
    captured = {}
    monkeypatch.setattr("app.services.api.main.fire_trigger", _fire_stub(captured, "connector.telegram"))

    with pytest.raises(HTTPException):
        asyncio.run(
            connector_telegram(
                "alert-webhook",
                ConnectorTelegramRequest(chat_id="123", text="hi", username="bob"),
                _FakeRequest({}),
            )
        )

    result = asyncio.run(
        connector_telegram(
            "alert-webhook",
            ConnectorTelegramRequest(chat_id="123", text="hi", username="bob"),
            _FakeRequest({"x-trigger-auth": "secret"}),
        )
    )
    assert result["source"] == "connector.telegram"
    assert captured["payload"]["chat_id"] == "123"
    assert captured["payload"]["text"] == "hi"
    assert captured["payload"]["username"] == "bob"


def test_email_connector_payload(monkeypatch):
    _setup_trigger(monkeypatch, "email")
    captured = {}
    monkeypatch.setattr("app.services.api.main.fire_trigger", _fire_stub(captured, "connector.email"))

    result = asyncio.run(
        connector_email(
            "alert-webhook",
            ConnectorEmailRequest(sender="alice@test", subject="hi", body="ok"),
            _FakeRequest({"x-trigger-auth": "secret"}),
        )
    )
    assert result["source"] == "connector.email"
    assert captured["payload"]["subject"] == "hi"
    assert captured["payload"]["body"] == "ok"
    assert captured["payload"]["sender"] == "alice@test"


def test_voice_connector_payload(monkeypatch):
    _setup_trigger(monkeypatch, "voice")
    captured = {}
    monkeypatch.setattr("app.services.api.main.fire_trigger", _fire_stub(captured, "connector.voice"))

    with pytest.raises(HTTPException):
        asyncio.run(
            connector_voice(
                "alert-webhook",
                ConnectorVoiceRequest(caller="123", transcript="Hi there"),
                _FakeRequest({}),
            )
        )

    result = asyncio.run(
        connector_voice(
            "alert-webhook",
            ConnectorVoiceRequest(caller="123", transcript="Hai tim", call_id="call-1"),
            _FakeRequest({"x-trigger-auth": "secret"}),
        )
    )
    assert result["source"] == "connector.voice"
    assert captured["payload"]["caller"] == "123"
    assert captured["payload"]["transcript"] == "Hai tim"
    assert captured["payload"]["call_id"] == "call-1"


def test_slack_connector_payload(monkeypatch):
    _setup_trigger(monkeypatch, "slack")
    captured = {}
    monkeypatch.setattr("app.services.api.main.fire_trigger", _fire_stub(captured, "connector.slack"))

    with pytest.raises(HTTPException):
        asyncio.run(
            connector_slack(
                "alert-webhook",
                ConnectorSlackRequest(channel_id="C123", user_id="U123", command="/run", text=""),
                _FakeRequest({}),
            )
        )

    result = asyncio.run(
        connector_slack(
            "alert-webhook",
            ConnectorSlackRequest(
                channel_id="C123",
                user_id="U123",
                command="/deploy",
                text="jalankan build",
                response_url="https://hooks.slack.com/actions",
            ),
            _FakeRequest({"x-trigger-auth": "secret"}),
        )
    )
    assert result["source"] == "connector.slack"
    assert captured["payload"]["command"] == "/deploy"
    assert captured["payload"]["response_url"] == "https://hooks.slack.com/actions"


def test_sms_connector_payload(monkeypatch):
    _setup_trigger(monkeypatch, "sms")
    captured = {}
    monkeypatch.setattr("app.services.api.main.fire_trigger", _fire_stub(captured, "connector.sms"))

    with pytest.raises(HTTPException):
        asyncio.run(
            connector_sms(
                "alert-webhook",
                ConnectorSmsRequest(phone_number="", message=""),
                _FakeRequest({}),
            )
        )

    result = asyncio.run(
        connector_sms(
            "alert-webhook",
            ConnectorSmsRequest(phone_number="+6281234567890", message="Cek status"),
            _FakeRequest({"x-trigger-auth": "secret"}),
        )
    )
    assert result["source"] == "connector.sms"
    assert captured["payload"]["phone_number"] == "+6281234567890"
    assert captured["payload"]["message"] == "Cek status"
