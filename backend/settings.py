"""Local, private runtime settings for NOVA.

NOVA talks only to the Ollama service running on this computer.  No paid AI
key is read, stored, or sent to the browser.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env", override=False)


def _origins(value: str) -> tuple[str, ...]:
    return tuple(origin.strip().rstrip("/") for origin in value.split(",") if origin.strip())


def _integer(name: str, default: int, minimum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(value, minimum)


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    frontend_origins: tuple[str, ...]
    session_secret: str
    session_cookie_name: str
    session_ttl_seconds: int
    max_upload_bytes: int
    rate_limit_per_minute: int
    ollama_base_url: str
    ollama_text_model: str
    ollama_vision_model: str
    ollama_keep_alive: str
    ollama_num_ctx: int
    ollama_num_predict: int

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def cookie_secure(self) -> bool:
        return self.is_production


@lru_cache
def get_settings() -> Settings:
    local_database = (BACKEND_DIR / "nova.db").as_posix()
    return Settings(
        app_env=os.getenv("APP_ENV", "development"),
        database_url=os.getenv("DATABASE_URL", f"sqlite:///{local_database}"),
        frontend_origins=_origins(
            os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
        ),
        session_secret=os.getenv("SESSION_SECRET", "nova-development-secret-change-before-deploy"),
        session_cookie_name=os.getenv("SESSION_COOKIE_NAME", "nova_session"),
        session_ttl_seconds=_integer("SESSION_TTL_SECONDS", 2_592_000, 3_600),
        max_upload_bytes=_integer("MAX_UPLOAD_BYTES", 8_388_608, 1024),
        rate_limit_per_minute=_integer("RATE_LIMIT_PER_MINUTE", 20, 1),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/"),
        ollama_text_model=os.getenv("OLLAMA_TEXT_MODEL", "qwen2.5:1.5b").strip() or "qwen2.5:1.5b",
        ollama_vision_model=os.getenv("OLLAMA_VISION_MODEL", "moondream:latest").strip() or "moondream:latest",
        ollama_keep_alive=os.getenv("OLLAMA_KEEP_ALIVE", "5m").strip() or "5m",
        ollama_num_ctx=_integer("OLLAMA_NUM_CTX", 2048, 256),
        ollama_num_predict=_integer("OLLAMA_NUM_PREDICT", 384, 64),
    )


def validate_production_settings() -> None:
    """Fail fast only for configuration needed to keep public sessions safe."""
    settings = get_settings()
    if not settings.is_production:
        return
    missing: list[str] = []
    if len(settings.session_secret) < 32 or "development-secret" in settings.session_secret:
        missing.append("SESSION_SECRET (use a random value of at least 32 characters)")
    if not settings.frontend_origins:
        missing.append("FRONTEND_ORIGINS")
    if not settings.ollama_base_url.startswith("http://127.0.0.1") and not settings.ollama_base_url.startswith("http://localhost"):
        missing.append("OLLAMA_BASE_URL (must stay local)")
    if missing:
        raise RuntimeError("Production configuration is incomplete: " + ", ".join(missing))
