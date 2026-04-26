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
