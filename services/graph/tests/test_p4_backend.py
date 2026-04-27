"""P4 backend endpoints: sessions, integrations, usage, deletion."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio(loop_scope="session")


HDR = {"X-User-Sub": "u-p4-test"}


# ── /api/users/me/sessions/revoke-all ──────────────────────────────


@pytest_asyncio.fixture(loop_scope="session")
async def _preserve_kc_settings():
    from src.config import settings
    saved = (
        settings.keycloak_admin_url,
        settings.keycloak_token_url,
        settings.keycloak_admin_client_id,
        settings.kc_gateway_client_secret,
    )
    yield
    (
        settings.keycloak_admin_url,
        settings.keycloak_token_url,
        settings.keycloak_admin_client_id,
        settings.kc_gateway_client_secret,
    ) = saved


async def test_revoke_all_unconfigured_returns_501(
    async_client, app_pool, _preserve_kc_settings,
):
    from src.config import settings
    settings.kc_gateway_client_secret = ""
    r = await async_client.post(
        "/api/users/me/sessions/revoke-all", headers=HDR,
    )
    assert r.status_code == 501
    assert "keycloak_admin_not_configured" in r.text


async def test_revoke_all_happy_path(
    async_client, app_pool, _preserve_kc_settings, monkeypatch,
):
    from src.api import sessions
    from src.config import settings

    settings.kc_gateway_client_secret = "secret"

    called: dict[str, int] = {"n": 0}

    async def fake_logout(user_sub: str) -> None:
        called["n"] += 1
        assert user_sub == "u-p4-test"

    monkeypatch.setattr(sessions, "_keycloak_logout_all", fake_logout)
    r = await async_client.post(
        "/api/users/me/sessions/revoke-all", headers=HDR,
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    assert called["n"] == 1


# ── /api/integrations/github/validate ──────────────────────────────


async def test_github_validate_ok(async_client, app_pool, monkeypatch):
    from src.api import integrations

    seen: dict[str, str] = {}

    async def fake_probe(token: str) -> dict:
        seen["token"] = token
        return {"login": "dany", "scopes": ["repo", "read:user"]}

    monkeypatch.setattr(integrations, "_probe_github", fake_probe)
    r = await async_client.post(
        "/api/integrations/github/validate",
        json={"token": "ghp_fake_token_00"},
        headers=HDR,
    )
    assert seen["token"] == "ghp_fake_token_00"
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["login"] == "dany"
    assert "repo" in body["scopes"]


async def test_github_validate_bad_token(
    async_client, app_pool, monkeypatch,
):
    from src.api import integrations

    async def fake_probe(token: str) -> dict:
        raise integrations.GitHubAuthError("401 Unauthorized")

    monkeypatch.setattr(integrations, "_probe_github", fake_probe)
    r = await async_client.post(
        "/api/integrations/github/validate",
        json={"token": "ghp_bad-token-00"},
        headers=HDR,
    )
    assert r.status_code == 422


async def test_github_validate_rejects_short_token(async_client, app_pool):
    r = await async_client.post(
        "/api/integrations/github/validate",
        json={"token": "short"},
        headers=HDR,
    )
    assert r.status_code == 422


# ── /api/users/me/usage ─────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_usage_rows(app_pool):
    from src.graph import store

    pool = store.get_pool()
    src_name = f"usage-{uuid.uuid4().hex[:8]}"
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            "INSERT INTO sources (user_sub, source_type, owner, name, url) "
            "VALUES ($1, 'github_repo', 'o', $2, 'u') RETURNING id::text",
            "u-p4-test", src_name,
        )
        # Pool installs a jsonb codec that json.dumps the dict automatically.
        # Passing json.dumps(...) here would double-encode and the -> path
        # ops below would fail silently (coalesce → 0), which was the exact
        # bug the fixture previously hit.
        for graph_bytes, embedding_bytes in ((1000, 2000), (1500, 2400)):
            await conn.execute(
                "INSERT INTO sync_runs (source_id, status, completed_at, "
                "                       stats) "
                "VALUES ($1::uuid, 'completed', now(), $2::jsonb)",
                src_id,
                {
                    "storage": {
                        "graph_bytes": graph_bytes,
                        "embedding_bytes": embedding_bytes,
                    },
                },
            )
    yield src_id
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE id = $1::uuid", src_id,
        )


async def test_usage_returns_counts_and_bytes(
    async_client, seeded_usage_rows,
):
    r = await async_client.get("/api/users/me/usage", headers=HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) >= {
        "sources", "snapshots", "embedding_bytes", "graph_bytes",
    }
    assert body["sources"] >= 1
    assert body["snapshots"] >= 2
    assert body["embedding_bytes"] >= 4400
    assert body["graph_bytes"] >= 2500


async def test_usage_cross_user_isolation(async_client, seeded_usage_rows):
    r = await async_client.get(
        "/api/users/me/usage",
        headers={"X-User-Sub": "u-other-nothing-here"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sources"] == 0
    assert body["snapshots"] == 0
    assert body["embedding_bytes"] == 0
    assert body["graph_bytes"] == 0


# ── /api/users/me/deletion-request ──────────────────────────────────


async def test_deletion_request_returns_501(async_client, app_pool):
    r = await async_client.post(
        "/api/users/me/deletion-request",
        json={"confirm": True},
        headers=HDR,
    )
    assert r.status_code == 501
    assert "not_implemented" in r.text
