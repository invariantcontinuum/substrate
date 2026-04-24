"""API tests for /api/users/me/preferences. Uses the real Postgres pool
via app_pool. Each test uses a unique X-User-Sub so rows don't collide."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _hdr(sub: str) -> dict[str, str]:
    return {"X-User-Sub": sub}


@pytest_asyncio.fixture(loop_scope="session")
async def user_sub(app_pool):
    """Fresh user for each test; cleanup after."""
    from src.graph import store
    sub = f"u-prefs-{uuid.uuid4().hex[:10]}"
    yield sub
    async with store.get_pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM user_preferences WHERE user_sub = $1", sub,
        )


async def test_get_returns_defaults_when_missing(async_client, user_sub):
    r = await async_client.get(
        "/api/users/me/preferences", headers=_hdr(user_sub),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["prefs"]["leiden"]["resolution"] == 1.0
    assert body["prefs"]["theme"] == "system"
    assert body["updated_at"] is None


async def test_put_deep_merges_and_persists(async_client, user_sub):
    r1 = await async_client.put(
        "/api/users/me/preferences",
        json={"theme": "dark"},
        headers=_hdr(user_sub),
    )
    assert r1.status_code == 200, r1.text
    merged = r1.json()["prefs"]
    assert merged["theme"] == "dark"
    assert merged["leiden"]["resolution"] == 1.0

    r2 = await async_client.put(
        "/api/users/me/preferences",
        json={"leiden": {"resolution": 2.0}},
        headers=_hdr(user_sub),
    )
    assert r2.status_code == 200, r2.text
    merged2 = r2.json()["prefs"]
    assert merged2["theme"] == "dark"             # prior put survives
    assert merged2["leiden"]["resolution"] == 2.0
    assert merged2["leiden"]["beta"] == 0.01       # default stays

    # GET after two PUTs returns the merged state
    r3 = await async_client.get(
        "/api/users/me/preferences", headers=_hdr(user_sub),
    )
    assert r3.status_code == 200
    assert r3.json()["prefs"]["theme"] == "dark"
    assert r3.json()["prefs"]["leiden"]["resolution"] == 2.0


async def test_put_rejects_out_of_range_leiden(async_client, user_sub):
    r = await async_client.put(
        "/api/users/me/preferences",
        json={"leiden": {"resolution": 999.0}},
        headers=_hdr(user_sub),
    )
    assert r.status_code == 422


async def test_put_rejects_invalid_theme(async_client, user_sub):
    r = await async_client.put(
        "/api/users/me/preferences",
        json={"theme": "midnight"},
        headers=_hdr(user_sub),
    )
    assert r.status_code == 422


async def test_put_rejects_non_bool_telemetry(async_client, user_sub):
    r = await async_client.put(
        "/api/users/me/preferences",
        json={"telemetry": "yes"},
        headers=_hdr(user_sub),
    )
    assert r.status_code == 422


async def test_communities_picks_up_persisted_leiden_defaults(
    async_client, user_sub, seeded_two_cluster_syncs,
):
    """After a user PUTs a leiden.min_cluster_size of 4, a communities GET
    with no explicit config must run with that value (observable in the
    returned config_used)."""
    r_put = await async_client.put(
        "/api/users/me/preferences",
        json={"leiden": {"min_cluster_size": 4, "resolution": 1.0}},
        headers=_hdr(user_sub),
    )
    assert r_put.status_code == 200

    r = await async_client.get(
        "/api/communities",
        params={"sync_ids": ",".join(seeded_two_cluster_syncs)},
        headers=_hdr(user_sub),
    )
    assert r.status_code == 200, r.text
    assert r.json()["config_used"]["min_cluster_size"] == 4
    assert r.json()["config_used"]["resolution"] == 1.0
