"""API tests for GET /api/syncs/{id}/delta. Seeds with inline SQL because
the fixture needs control over stats jsonb shape + completed_at order."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio(loop_scope="session")


USER = "u-delta-test"
HDR = {"X-User-Sub": USER}


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_first_sync(app_pool):
    """One source + one completed sync_run. Returns the sync_id."""
    from src.graph import store
    pool = store.get_pool()
    src_name = f"delta-first-{uuid.uuid4().hex[:8]}"
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            "INSERT INTO sources (user_sub, source_type, owner, name, url) "
            "VALUES ($1, 'github_repo', 'o', $2, 'u') RETURNING id::text",
            USER, src_name,
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at, stats) "
            "VALUES ($1::uuid, 'completed', now(), "
            "        '{\"counts\":{\"node_count\":10,\"edge_count\":20}}'::jsonb) "
            "RETURNING id::text",
            src_id,
        )
    yield sync_id
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", src_id)


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_two_sequential_syncs(app_pool):
    """One source + two completed sync_runs with different stats and
    different completed_at. Returns ``(newer_id, older_id)``."""
    from src.graph import store
    pool = store.get_pool()
    src_name = f"delta-seq-{uuid.uuid4().hex[:8]}"
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            "INSERT INTO sources (user_sub, source_type, owner, name, url) "
            "VALUES ($1, 'github_repo', 'o', $2, 'u') RETURNING id::text",
            USER, src_name,
        )
        older = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at, stats) "
            "VALUES ($1::uuid, 'completed', now() - interval '1 hour', "
            "        '{\"counts\":{\"node_count\":100,\"edge_count\":200,"
            "                     \"files_indexed\":50},"
            "          \"storage\":{\"graph_bytes\":1000,"
            "                       \"embedding_bytes\":2000},"
            "          \"leiden\":{\"count\":3,\"modularity\":0.42}}'::jsonb) "
            "RETURNING id::text",
            src_id,
        )
        newer = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at, stats) "
            "VALUES ($1::uuid, 'completed', now(), "
            "        '{\"counts\":{\"node_count\":150,\"edge_count\":310,"
            "                     \"files_indexed\":70},"
            "          \"storage\":{\"graph_bytes\":1500,"
            "                       \"embedding_bytes\":2400},"
            "          \"leiden\":{\"count\":5,\"modularity\":0.58}}'::jsonb) "
            "RETURNING id::text",
            src_id,
        )
    yield newer, older
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", src_id)


async def test_delta_null_for_first_sync(async_client, seeded_first_sync):
    r = await async_client.get(
        f"/api/syncs/{seeded_first_sync}/delta", headers=HDR,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["delta"] is None
    assert body["prior_sync_id"] is None


async def test_delta_computes_counts(async_client, seeded_two_sequential_syncs):
    newer, _ = seeded_two_sequential_syncs
    r = await async_client.get(f"/api/syncs/{newer}/delta", headers=HDR)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["prior_sync_id"] is not None
    d = body["delta"]
    assert d["node_count"] == 50
    assert d["edge_count"] == 110
    assert d["files_indexed"] == 20
    assert d["community_count"] == 2
    assert d["modularity"] == 0.16
    assert d["storage_bytes"] == 900


async def test_delta_returns_404_for_foreign_user(
    async_client, seeded_first_sync,
):
    r = await async_client.get(
        f"/api/syncs/{seeded_first_sync}/delta",
        headers={"X-User-Sub": "u-other"},
    )
    assert r.status_code == 404


async def test_delta_handles_missing_stats_subtrees(async_client, app_pool):
    """A sync row whose stats lacks counts/storage/leiden subtrees must still
    yield a zero-filled delta against a prior that has them — not a 500."""
    from src.graph import store
    pool = store.get_pool()
    src_name = f"delta-partial-{uuid.uuid4().hex[:8]}"
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            "INSERT INTO sources (user_sub, source_type, owner, name, url) "
            "VALUES ($1, 'github_repo', 'o', $2, 'u') RETURNING id::text",
            USER, src_name,
        )
        await conn.execute(
            "INSERT INTO sync_runs (source_id, status, completed_at, stats) "
            "VALUES ($1::uuid, 'completed', now() - interval '1 hour', "
            "        '{}'::jsonb)",
            src_id,
        )
        newer = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at, stats) "
            "VALUES ($1::uuid, 'completed', now(), "
            "        '{\"counts\":{\"node_count\":5}}'::jsonb) "
            "RETURNING id::text",
            src_id,
        )
    try:
        r = await async_client.get(f"/api/syncs/{newer}/delta", headers=HDR)
        assert r.status_code == 200
        d = r.json()["delta"]
        assert d["node_count"] == 5
        assert d["edge_count"] == 0
        assert d["modularity"] == 0.0
    finally:
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM sources WHERE id = $1::uuid", src_id,
            )
