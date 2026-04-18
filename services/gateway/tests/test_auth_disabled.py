import pytest
from fastapi import Response
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock


def _reload_app():
    """Reload src.config and src.main so current env vars take effect on
    the module-level `settings` singleton and the FastAPI app instance."""
    from importlib import reload
    import src.config, src.main
    reload(src.config)
    reload(src.main)
    return src.main.app


@pytest.fixture
def client_auth_off(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "true")
    monkeypatch.setenv("CORS_ORIGINS", '["http://localhost:3535"]')
    app = _reload_app()
    try:
        yield TestClient(app)
    finally:
        # Teardown — strip the env and reload so the module-level
        # `settings` singleton reverts to its defaults. Without this,
        # subsequent tests that imported `src.main` at collection time
        # would keep seeing AUTH_DISABLED=true and mis-route auth.
        monkeypatch.delenv("AUTH_DISABLED", raising=False)
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        _reload_app()


@pytest.fixture
def client_auth_on(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "false")
    monkeypatch.setenv("CORS_ORIGINS", '["http://localhost:3535"]')
    app = _reload_app()
    try:
        yield TestClient(app)
    finally:
        monkeypatch.delenv("AUTH_DISABLED", raising=False)
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        _reload_app()


def test_auth_disabled_bypasses_jwt(client_auth_off):
    fake_response = Response(content=b'{"ok": true}', status_code=200)
    with patch("src.main.proxy_request", new=AsyncMock(return_value=fake_response)):
        r = client_auth_off.get("/api/sources")
    # With AUTH_DISABLED=true we must NOT get 401 even without Authorization header
    assert r.status_code != 401


def test_auth_enabled_rejects_missing_token(client_auth_on):
    r = client_auth_on.get("/api/sources")
    assert r.status_code == 401
    assert r.json() == {"error": "unauthorized"}


def test_cors_allows_brainrot_origin(client_auth_off):
    r = client_auth_off.options(
        "/api/sources",
        headers={
            "Origin": "http://localhost:3535",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3535"


def test_cors_rejects_other_origin(client_auth_off):
    r = client_auth_off.options(
        "/api/sources",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert r.headers.get("access-control-allow-origin") is None
