"""Internal config routes return the merged effective settings dict.

The gateway's ``fetch_effective_section()`` proxy hits each owning service
at ``GET /internal/config/{section}``. This test pins the wire shape:
known sections return a dict whose keys match the registry, unknown
sections return 404, and sensitive keys (``github_pat``) are not echoed.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.mark.asyncio
async def test_auth_section_returns_known_keys() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/internal/config/auth")
    assert r.status_code == 200, r.text
    body = r.json()
    # Schema-registered fields are present; values may be None or strings,
    # depending on how the gateway settings were loaded under test.
    assert "keycloak_url" in body
    assert "keycloak_realm" in body
    assert "keycloak_account_console_url" in body
    assert "keycloak_public_client_id" in body


@pytest.mark.asyncio
async def test_github_section_does_not_echo_pat() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/internal/config/github")
    assert r.status_code == 200, r.text
    # github_pat is intentionally NOT exposed via GET; the body is empty.
    assert r.json() == {}


@pytest.mark.asyncio
async def test_unknown_section_returns_404() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/internal/config/nope")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_fetch_effective_section_uses_inprocess_call_for_gateway_owner(
    monkeypatch,
):
    """Self-owned sections must NOT make an HTTP loopback call.

    Regression for DSG-2026-04-27-A §1.2 — the previous code resolved
    owner=='gateway' to http://127.0.0.1:8000, but the gateway listens
    on APP_PORT (8080 in compose). Any GET /api/config/auth call ended
    up as httpx.ConnectError → 500.
    """
    import httpx

    from src.config_runtime import fetch_effective_section

    calls: list[str] = []

    class _RecordingClient:
        """Faithful httpx.AsyncClient stand-in. If the in-process path
        regresses and HTTP gets called, this records the URL so the
        `assert calls == []` post-await fires meaningfully."""
        def __init__(self, *args, **kwargs):
            # Pre-MVP: ignore timeout/auth args — this client is only
            # used to detect that a regression made it back to httpx.
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return False
        async def get(self, url, *args, **kwargs):
            calls.append(url)
            # Return a real httpx.Response so fetch_effective_section's
            # downstream `.raise_for_status()` doesn't AttributeError —
            # the regression guard is `assert calls == []`, not exception
            # type.
            return httpx.Response(
                status_code=599,  # impossible status; would raise_for_status
                content=b'{"_test": "should never reach here"}',
                headers={"content-type": "application/json"},
                request=httpx.Request("GET", url),
            )

    monkeypatch.setattr(httpx, "AsyncClient", _RecordingClient)

    payload = await fetch_effective_section(section="auth", owner="gateway")
    assert calls == [], f"unexpected HTTP calls: {calls}"
    assert "keycloak_url" in payload
    assert "keycloak_realm" in payload
