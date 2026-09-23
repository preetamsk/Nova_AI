from settings import get_settings


def test_local_ollama_defaults_are_private_and_low_memory():
    settings = get_settings()
    assert settings.ollama_base_url.startswith("http://127.0.0.1")
    assert settings.ollama_text_model == "qwen2.5:1.5b"
    assert settings.ollama_num_ctx <= 4096
    assert settings.ollama_num_predict <= 2048


def test_database_url_normalizes_postgres_protocols(monkeypatch):
    import os
    from settings import _database_url

    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@host:5432/db")
    assert _database_url() == "postgresql+psycopg://user:pass@host:5432/db"

    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    assert _database_url() == "postgresql+psycopg://user:pass@host:5432/db"


def test_cloud_provider_auto_detects_groq_and_gemini(monkeypatch):
    from services.ai_service import _get_provider_config
    from settings import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test123")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    groq_config = _get_provider_config()
    assert groq_config["provider"] == "Groq"
    assert "api.groq.com" in groq_config["base_url"]
    assert groq_config["api_key"] == "gsk_test123"

    get_settings.cache_clear()
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "gemini_test123")
    gemini_config = _get_provider_config()
    assert gemini_config["provider"] == "Google Gemini"
    assert "generativelanguage.googleapis.com" in gemini_config["base_url"]
    get_settings.cache_clear()

