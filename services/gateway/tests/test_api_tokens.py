"""Integration tests for the API-token CRUD + bearer auth fast-path.

Uses the testcontainers ``pg_dsn`` fixture so V9 actually creates the
``api_tokens`` table. The gateway's auth-disabled fixture lets the
synthetic 'dev' user own the tokens without standing up a Keycloak.
"""
from __future__ import annotations

import os

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Test the gateway under auth_disabled=true so no JWKS round-trips are
# required. This still exercises the real DB pool, the real router
# wiring, and the real PAT lookup path because we manually insert tokens
# and probe with a Bearer header.
os.environ.setdefault("AUTH_DISABLED", "true")

from src.api.account import hash_token


@pytest_asyncio.fixture
async def gateway_app(pg_dsn, monkeypatch):
    """Boot the gateway against the testcontainer DSN.

    The gateway initialises its asyncpg pool inside ``init_pool`` from
    ``sse_endpoint``. We override the settings so the pool points at
    the migrated testcontainer.
    """
    from src import main as gw_main
    from src.config import settings

    # Coerce the synchronous psycopg DSN to the asyncpg shape Pydantic
    # settings expect.
    asyncpg_url = pg_dsn.replace("postgresql+psycopg2", "postgresql")
    monkeypatch.setattr(settings, "database_url", asyncpg_url)
    monkeypatch.setattr(settings, "auth_disabled", True)
    # Insert the synthetic 'dev' user_profiles row that auth_disabled
    # mode pretends is logged in.
    raw_dsn = asyncpg_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(raw_dsn)
    try:
        await conn.execute(
            """
            INSERT INTO user_profiles (user_sub) VALUES ('dev')
            ON CONFLICT (user_sub) DO NOTHING
            """,
        )
        await conn.execute("DELETE FROM api_tokens WHERE user_sub = 'dev'")
    finally:
        await conn.close()
    # Drive lifespan so the pool comes up.
    transport = ASGITransport(app=gw_main.app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        # Force lifespan startup. ASGITransport runs lifespan when the
        # first request lands.
        r = await c.get("/health")
        assert r.status_code == 200
        yield c, raw_dsn


@pytest.mark.asyncio
async def test_create_then_list_then_revoke(gateway_app):
    client, _ = gateway_app

    # Create
    r = await client.post(
        "/api/users/me/api-tokens",
        json={"label": "ci-token"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["label"] == "ci-token"
    plaintext = body["token"]
    assert plaintext.startswith("subs_")
    assert len(body["prefix"]) == 8
    token_id = body["id"]

    # List
    r = await client.get("/api/users/me/api-tokens")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["id"] == token_id
    assert rows[0]["revoked_at"] is None
    assert "token" not in rows[0]  # plaintext NOT returned on list

    # Revoke
    r = await client.delete(f"/api/users/me/api-tokens/{token_id}")
    assert r.status_code == 200, r.text
    assert r.json() == {"revoked": True}

    # Listing again still surfaces the revoked row.
    r = await client.get("/api/users/me/api-tokens")
    assert r.status_code == 200
    assert r.json()[0]["revoked_at"] is not None


@pytest.mark.asyncio
async def test_pat_bearer_auth_resolves_to_owner(gateway_app):
    client, raw_dsn = gateway_app

    r = await client.post(
        "/api/users/me/api-tokens",
        json={"label": "bearer-test"},
    )
    plaintext = r.json()["token"]

    # Re-list with the PAT as the bearer instead of relying on
    # auth_disabled. Toggle auth_disabled OFF for the duration of this
    # call so the gateway is forced down the PAT path.
    from src.config import settings

    settings.auth_disabled = False
    try:
        r = await client.get(
            "/api/users/me/api-tokens",
            headers={"Authorization": f"Bearer {plaintext}"},
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 1
    finally:
        settings.auth_disabled = True


@pytest.mark.asyncio
async def test_revoked_pat_rejected(gateway_app):
    client, raw_dsn = gateway_app

    r = await client.post(
        "/api/users/me/api-tokens",
        json={"label": "to-revoke"},
    )
    body = r.json()
    plaintext = body["token"]
    token_id = body["id"]

    # Revoke
    await client.delete(f"/api/users/me/api-tokens/{token_id}")

    from src.config import settings

    settings.auth_disabled = False
    try:
        r = await client.get(
            "/api/users/me/api-tokens",
            headers={"Authorization": f"Bearer {plaintext}"},
        )
        assert r.status_code == 401, r.text
    finally:
        settings.auth_disabled = True


@pytest.mark.asyncio
async def test_expired_pat_rejected(gateway_app):
    client, raw_dsn = gateway_app

    # Create a token, then manually backdate its expires_at via direct
    # SQL — the public CRUD doesn't accept past expiry.
    r = await client.post(
        "/api/users/me/api-tokens",
        json={"label": "expiring"},
    )
    body = r.json()
    plaintext = body["token"]

    conn = await asyncpg.connect(raw_dsn)
    try:
        await conn.execute(
            "UPDATE api_tokens SET expires_at = now() - interval '1 hour' "
            "WHERE token_hash = $1",
            hash_token(plaintext),
        )
    finally:
        await conn.close()

    from src.config import settings

    settings.auth_disabled = False
    try:
        r = await client.get(
            "/api/users/me/api-tokens",
            headers={"Authorization": f"Bearer {plaintext}"},
        )
        assert r.status_code == 401, r.text
    finally:
        settings.auth_disabled = True


@pytest.mark.asyncio
async def test_unknown_pat_rejected(gateway_app):
    client, _ = gateway_app

    from src.config import settings

    settings.auth_disabled = False
    try:
        r = await client.get(
            "/api/users/me/api-tokens",
            headers={"Authorization": "Bearer subs_completelyfake"},
        )
        assert r.status_code == 401, r.text
    finally:
        settings.auth_disabled = True
