"""Signed, HTTP-only anonymous sessions for NOVA visitors.

NOVA is intentionally link-friendly: a visitor does not need an account to
start a chat. The signed cookie still gives each browser an isolated identity
so conversation URLs cannot expose another visitor's history.
"""

from __future__ import annotations

import secrets

from fastapi import Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from services.history_service import claim_legacy_local_profile
from settings import get_settings


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt="nova-browser-session-v1")


def _read_session(token: str | None) -> str | None:
    if not token:
        return None
    settings = get_settings()
    try:
        value = _serializer().loads(token, max_age=settings.session_ttl_seconds)
    except (BadSignature, SignatureExpired):
        return None
    return value if isinstance(value, str) and value else None


def _write_session(response: Response, user_id: str, secure: bool = False) -> None:
    settings = get_settings()
    token = _serializer().dumps(user_id)
    response.headers["x-nova-session"] = token
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=secure,
        samesite="none" if secure else "lax",
        path="/",
    )


def current_user_id(request: Request, response: Response) -> str:
    """Return the current opaque user id, issuing a secure guest session if needed."""
    settings = get_settings()
    token = request.headers.get("x-nova-session") or request.cookies.get(settings.session_cookie_name)
    user_id = _read_session(token)
    if user_id:
        response.headers["x-nova-session"] = token
        return user_id
    user_id = claim_legacy_local_profile() or secrets.token_urlsafe(24)
    is_secure = settings.cookie_secure or request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    _write_session(response, user_id, secure=is_secure)
    return user_id
