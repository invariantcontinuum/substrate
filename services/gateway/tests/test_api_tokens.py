"""Integration tests for the API-token CRUD + bearer auth fast-path.

Runs against the live ``substrate_graph`` Postgres on localhost — the
same pattern the graph service uses for its own integration suite. The
testcontainers fixture under ``substrate_common.testing.pg`` doesn't
register the ``Symbol`` AGE vlabel that the per-sync graph migrations
require, so spinning up a per-test container just for this suite would
duplicate AGE bootstrap that already lives in
``ops/infra/postgres/01-init-databases.sh``.

The gateway is exercised under ``auth_disabled=true`` (synthetic 'dev'
user) for most assertions, then flipped to enforce real bearer auth so
the PAT lookup path is verified end-to-end.
"""
from __future__ import annotations

import os

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from asgi_lifespan import LifespanManager

# Set BEFORE importing src.* so the layered settings overlay sees it.
os.environ.setdefault("AUTH_DISABLED", "true")

from src.api.account import hash_token


def _dsn() -> str:
    """DSN for the live substrate_graph DB on localhost — matches the
    pattern used by ``services/graph/tests/conftest.py::_dsn``."""
    return os.environ.get(
        "GRAPH_DATABASE_URL",
        "postgresql://substrate_graph:change-me@localhost:5432/substrate_graph",
    ).replace("postgresql+asyncpg://", "postgresql://")


@pytest_asyncio.fixture
async def gateway_app(monkeypatch):
    """Boot the gateway against the live DB.

    The gateway initialises its asyncpg pool inside ``init_pool`` from
    ``sse_endpoint`` once the FastAPI lifespan starts. The lifespan
    also calls ``ConfigRefresher.init`` which REBUILDS ``settings``
    from layered sources — so a direct ``monkeypatch.setattr(settings,
    ...)`` is overwritten on every fixture entry. We instead set the
    env vars before reloading the config + main modules so the new
    settings instance reads the localhost DSN.
    """
    asyncpg_dsn = (
        f"postgresql+asyncpg://{_dsn().split('://', 1)[1]}"
    )
    monkeypatch.setenv("DATABASE_URL", asyncpg_dsn)
    monkeypatch.setenv("AUTH_DISABLED", "true")

    import importlib
    from src import config as _cfg
    importlib.reload(_cfg)
    from src import main as gw_main
    importlib.reload(gw_main)
    raw_dsn = _dsn()
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
    async with LifespanManager(gw_main.app):
        transport = ASGITransport(app=gw_main.app)
        async with AsyncClient(transport=transport, base_url="http://t") as c:
            r = await c.get("/health")
            assert r.status_code == 200
            yield c, raw_dsn
    # Best-effort cleanup so reruns don't leak rows.
    conn = await asyncpg.connect(raw_dsn)
    try:
        await conn.execute("DELETE FROM api_tokens WHERE user_sub = 'dev'")
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_create_then_list_then_revoke(gateway_app):
    client, _ = gateway_app

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

    r = await client.get("/api/users/me/api-tokens")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["id"] == token_id
    assert rows[0]["revoked_at"] is None
    assert "token" not in rows[0]

    r = await client.delete(f"/api/users/me/api-tokens/{token_id}")
    assert r.status_code == 200, r.text
    assert r.json() == {"revoked": True}

    r = await client.get("/api/users/me/api-tokens")
    assert r.status_code == 200
    assert r.json()[0]["revoked_at"] is not None


@pytest.mark.asyncio
async def test_pat_bearer_auth_resolves_to_owner(gateway_app):
    client, _ = gateway_app

    r = await client.post(
        "/api/users/me/api-tokens",
        json={"label": "bearer-test"},
    )
    plaintext = r.json()["token"]

    # ``main`` captures ``settings`` at import time; toggling there
    # is what ``_authenticate`` actually reads.
    from src import main as _main

    _main.settings.auth_disabled = False
    try:
        r = await client.get(
            "/api/users/me/api-tokens",
            headers={"Authorization": f"Bearer {plaintext}"},
        )
        assert r.status_code == 200, r.text
        assert len(r.json()) >= 1
    finally:
        _main.settings.auth_disabled = True


@pytest.mark.asyncio
async def test_revoked_pat_rejected(gateway_app):
    client, _ = gateway_app

    r = await client.post(
        "/api/users/me/api-tokens",
        json={"label": "to-revoke"},
    )
    body = r.json()
    plaintext = body["token"]
    token_id = body["id"]
    await client.delete(f"/api/users/me/api-tokens/{token_id}")

    # ``main`` captures ``settings`` at import time; toggling there
    # is what ``_authenticate`` actually reads.
    from src import main as _main

    _main.settings.auth_disabled = False
    try:
        r = await client.get(
            "/api/users/me/api-tokens",
            headers={"Authorization": f"Bearer {plaintext}"},
        )
        assert r.status_code == 401, r.text
    finally:
        _main.settings.auth_disabled = True


@pytest.mark.asyncio
async def test_expired_pat_rejected(gateway_app):
    client, raw_dsn = gateway_app

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

    # ``main`` captures ``settings`` at import time; toggling there
    # is what ``_authenticate`` actually reads.
    from src import main as _main

    _main.settings.auth_disabled = False
    try:
        r = await client.get(
            "/api/users/me/api-tokens",
            headers={"Authorization": f"Bearer {plaintext}"},
        )
        assert r.status_code == 401, r.text
    finally:
        _main.settings.auth_disabled = True


@pytest.mark.asyncio
async def test_unknown_pat_rejected(gateway_app):
    client, _ = gateway_app

    # ``main`` captures ``settings`` at import time; toggling there
    # is what ``_authenticate`` actually reads.
    from src import main as _main

    _main.settings.auth_disabled = False
    try:
        r = await client.get(
            "/api/users/me/api-tokens",
            headers={"Authorization": "Bearer subs_completelyfake"},
        )
        assert r.status_code == 401, r.text
    finally:
        _main.settings.auth_disabled = True
