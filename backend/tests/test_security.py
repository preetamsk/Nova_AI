from fastapi.testclient import TestClient

from app import app


def test_cors_allows_only_the_configured_local_frontend():
    with TestClient(app) as browser:
        approved = browser.options(
            "/chat/stream",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert approved.status_code == 200
        assert approved.headers["access-control-allow-origin"] == "http://localhost:3000"
        assert approved.headers["access-control-allow-credentials"] == "true"

        rejected = browser.options(
            "/chat/stream",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert rejected.status_code == 400
