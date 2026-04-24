"""API tests for /api/activity merged feed."""
from __future__ import annotations

import json
import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio(loop_scope="session")


USER = "u-activity-test"
HDR = {"X-User-Sub": USER}


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_activity_rows(app_pool):
    """Seed 6 completed sync_runs + 2 leiden_cache rows for the test user,
    all with increasing timestamps so ordering is predictable. Cleans up
    all three tables on teardown."""
    from src.graph import store
    pool = store.get_pool()
    src_name = f"activity-{uuid.uuid4().hex[:8]}"
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            "INSERT INTO sources (user_sub, source_type, owner, name, url) "
            "VALUES ($1, 'github_repo', 'o', $2, 'u') RETURNING id::text",
            USER, src_name,
        )
        sync_ids: list[str] = []
        for i in range(6):
            sid = await conn.fetchval(
                "INSERT INTO sync_runs (source_id, status, completed_at, "
                "                       stats) "
                "VALUES ($1::uuid, 'completed', "
                "        now() - make_interval(mins => $2::int), "
                "        $3::jsonb) "
                "RETURNING id::text",
                src_id, i,
                json.dumps({
                    "counts": {
                        "node_count": 10 * (i + 1),
                        "edge_count": 20 * (i + 1),
                    },
                }),
            )
            sync_ids.append(sid)
        cache_keys: list[str] = []
        for i in range(2):
            key = f"leiden-{uuid.uuid4().hex[:12]}"
            await conn.execute(
                "INSERT INTO leiden_cache ("
                "  cache_key, user_sub, sync_ids, config, community_count, "
                "  modularity, orphan_pct, community_sizes, assignments, "
                "  labels, compute_ms, created_at, expires_at"
                ") VALUES ("
                "  $1, $2, ARRAY[]::uuid[], '{}'::jsonb, $3, $4, 0, "
                "  ARRAY[]::int[], '{}'::jsonb, '{}'::jsonb, 0, "
                "  now() - make_interval(mins => $5::int), "
                "  now() + interval '1 day'"
                ")",
                key, USER, 3 + i, 0.5 + 0.05 * i, i * 2,
            )
            cache_keys.append(key)
    yield sync_ids, cache_keys
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM leiden_cache WHERE user_sub = $1", USER,
        )
        await conn.execute(
            "DELETE FROM sources WHERE id = $1::uuid", src_id,
        )


async def test_activity_feed_merges_sync_and_leiden(
    async_client, seeded_activity_rows,
):
    r = await async_client.get(
        "/api/activity", params={"limit": 20}, headers=HDR,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body
    assert len(body["items"]) >= 6  # 6 syncs + 2 leiden (some may share ts)
    kinds = {item["kind"] for item in body["items"]}
    assert any(k.startswith("sync.") for k in kinds)
    assert "leiden.computed" in kinds
    for item in body["items"]:
        assert set(item.keys()) >= {"id", "kind", "ts", "subject", "detail"}
        assert isinstance(item["detail"], dict)


async def test_activity_descending_by_ts(
    async_client, seeded_activity_rows,
):
    r = await async_client.get(
        "/api/activity", params={"limit": 20}, headers=HDR,
    )
    assert r.status_code == 200
    ts_list = [item["ts"] for item in r.json()["items"]]
    assert ts_list == sorted(ts_list, reverse=True)


async def test_activity_pagination(
    async_client, seeded_activity_rows,
):
    r1 = await async_client.get(
        "/api/activity", params={"limit": 3}, headers=HDR,
    )
    assert r1.status_code == 200
    body1 = r1.json()
    assert len(body1["items"]) == 3
    assert body1["next_cursor"] is not None

    r2 = await async_client.get(
        "/api/activity",
        params={"limit": 3, "cursor": body1["next_cursor"]},
        headers=HDR,
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert len(body2["items"]) >= 1
    ids1 = {i["id"] for i in body1["items"]}
    ids2 = {i["id"] for i in body2["items"]}
    assert ids1.isdisjoint(ids2)


async def test_activity_cross_user_isolation(
    async_client, seeded_activity_rows,
):
    r = await async_client.get(
        "/api/activity",
        params={"limit": 20},
        headers={"X-User-Sub": "u-other-unrelated"},
    )
    assert r.status_code == 200
    # The seeded rows belong to USER, not to this header.
    assert r.json()["items"] == []


async def test_activity_invalid_cursor_returns_400(async_client):
    r = await async_client.get(
        "/api/activity",
        params={"cursor": "not-base64-!@#$"},
        headers=HDR,
    )
    assert r.status_code == 400
