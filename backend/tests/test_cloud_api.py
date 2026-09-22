from __future__ import annotations

from fastapi.testclient import TestClient

import chat
from app import app
from services.history_service import configure_database, initialize_database
from services.ollama_service import NOVAServiceError


def _fake_stream(*_args, **_kwargs):
    yield "Hello"
    yield " from local NOVA"


def _ollama_error(*_args, **_kwargs):
    raise NOVAServiceError("NOVA cannot reach Ollama. Open Ollama, wait a moment, then try again.")


def test_guest_sessions_keep_histories_private_and_stream_replies(tmp_path, monkeypatch):
    configure_database(f"sqlite:///{tmp_path / 'test-nova.db'}")
    initialize_database()
    monkeypatch.setattr(chat, "stream_response", _fake_stream)

    with TestClient(app) as first_browser, TestClient(app) as second_browser:
        created = first_browser.post(
            "/chat/stream", json={"conversation_id": "first-chat", "message": "Say hello", "request_id": "request-one"}
        )
        assert created.status_code == 200
        assert 'event: token' in created.text
        assert '"text": "Hello"' in created.text
        assert '"text": " from local NOVA"' in created.text

        history = first_browser.get("/conversations/first-chat/messages")
        assert [message["role"] for message in history.json()] == ["user", "assistant"]
        assert history.json()[1]["content"] == "Hello from local NOVA"
        assert second_browser.get("/conversations/first-chat/messages").status_code == 404


def test_first_stream_response_initializes_a_private_session(tmp_path, monkeypatch):
    configure_database(f"sqlite:///{tmp_path / 'first-stream.db'}")
    initialize_database()
    monkeypatch.setattr(chat, "stream_response", _fake_stream)

    with TestClient(app) as browser:
        started = browser.post("/chat/stream", json={"conversation_id": "instant-chat", "message": "Hi"})
        assert started.status_code == 200
        assert "nova_session=" in started.headers["set-cookie"]
        assert browser.get("/conversations/instant-chat/messages").status_code == 200


def test_ollama_errors_are_visible_and_saved_as_assistant_messages(tmp_path, monkeypatch):
    configure_database(f"sqlite:///{tmp_path / 'provider-error.db'}")
    initialize_database()
    monkeypatch.setattr(chat, "stream_response", _ollama_error)

    with TestClient(app) as browser:
        reply = browser.post("/chat/stream", json={"conversation_id": "error-chat", "message": "Hello"})
        assert reply.status_code == 200
        assert "cannot reach Ollama" in reply.text
        stored = browser.get("/conversations/error-chat/messages").json()
        assert stored[-1]["role"] == "assistant"
        assert "cannot reach Ollama" in stored[-1]["content"]


def test_rejects_invalid_uploads(tmp_path, monkeypatch):
    configure_database(f"sqlite:///{tmp_path / 'uploads.db'}")
    initialize_database()
    monkeypatch.setattr(chat, "stream_response", _fake_stream)
    with TestClient(app) as browser:
        invalid = browser.post("/chat/stream", json={"conversation_id": "upload-chat", "message": "", "document": "not-a-pdf"})
        assert invalid.status_code == 422


def test_multi_turn_chat_with_header_session(tmp_path, monkeypatch):
    configure_database(f"sqlite:///{tmp_path / 'multi-turn.db'}")
    initialize_database()
    monkeypatch.setattr(chat, "stream_response", _fake_stream)

    client = TestClient(app)
    # Turn 1
    resp1 = client.post("/chat/stream", json={"conversation_id": "conv-1", "message": "First question"})
    assert resp1.status_code == 200
    token = resp1.headers.get("x-nova-session")
    assert token is not None

    # Turn 2: Using x-nova-session header
    resp2 = client.post(
        "/chat/stream",
        json={"conversation_id": "conv-1", "message": "Second question"},
        headers={"x-nova-session": token},
    )
    assert resp2.status_code == 200
    assert "event: token" in resp2.text

    history = client.get("/conversations/conv-1/messages", headers={"x-nova-session": token})
    assert history.status_code == 200
    assert len(history.json()) == 4
