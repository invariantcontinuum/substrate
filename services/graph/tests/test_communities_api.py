"""API tests for /api/communities endpoints."""
import json

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


HDR = {"X-User-Sub": "u-test"}


async def test_get_communities_returns_summary(
    async_client, seeded_two_cluster_syncs,
):
    r = await async_client.get(
        "/api/communities",
        params={"sync_ids": ",".join(seeded_two_cluster_syncs)},
        headers=HDR,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"]["community_count"] >= 2
    assert "cache_key" in body
    assert body["cached"] is False
    assert len(body["communities"]) == body["summary"]["community_count"]


async def test_get_communities_cache_hit(
    async_client, seeded_two_cluster_syncs,
):
    params = {"sync_ids": ",".join(seeded_two_cluster_syncs)}
    first = await async_client.get(
        "/api/communities", params=params, headers=HDR,
    )
    second = await async_client.get(
        "/api/communities", params=params, headers=HDR,
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["cached"] is True
    assert first.json()["cache_key"] == second.json()["cache_key"]


async def test_recompute_bypasses_cache(
    async_client, seeded_two_cluster_syncs,
):
    params = {"sync_ids": ",".join(seeded_two_cluster_syncs)}
    await async_client.get(
        "/api/communities", params=params, headers=HDR,
    )
    body = {
        "sync_ids": list(seeded_two_cluster_syncs),
        "config": {
            "resolution": 1.0, "beta": 0.01, "iterations": 10,
            "min_cluster_size": 3, "seed": 42,
        },
    }
    r = await async_client.post(
        "/api/communities/recompute", json=body, headers=HDR,
    )
    assert r.status_code == 200, r.text
    assert r.json()["cached"] is False


async def test_assignments_streams_ndjson(
    async_client, seeded_two_cluster_syncs,
):
    params = {"sync_ids": ",".join(seeded_two_cluster_syncs)}
    r1 = await async_client.get(
        "/api/communities", params=params, headers=HDR,
    )
    key = r1.json()["cache_key"]

    r2 = await async_client.get(
        "/api/communities/assignments",
        params={"cache_key": key}, headers=HDR,
    )
    assert r2.status_code == 200
    assert r2.headers["content-type"].startswith("application/x-ndjson")
    lines = [line for line in r2.text.strip().split("\n") if line]
    assert len(lines) >= 8  # fixture seeds 8 files
    for line in lines:
        obj = json.loads(line)
        assert "node_id" in obj and "community_index" in obj


async def test_community_nodes_paginates(
    async_client, seeded_two_cluster_syncs,
):
    params = {"sync_ids": ",".join(seeded_two_cluster_syncs)}
    r1 = await async_client.get(
        "/api/communities", params=params, headers=HDR,
    )
    key = r1.json()["cache_key"]
    r2 = await async_client.get(
        f"/api/communities/{key}/0/nodes",
        params={"limit": 2}, headers=HDR,
    )
    assert r2.status_code == 200
    assert len(r2.json()["items"]) == 2
    assert r2.json()["next_cursor"] is not None


async def test_missing_sync_ids_returns_400(async_client):
    r = await async_client.get(
        "/api/communities",
        params={"sync_ids": ""},
        headers=HDR,
    )
    assert r.status_code == 400


async def test_invalid_config_returns_400(
    async_client, seeded_two_cluster_syncs,
):
    r = await async_client.get(
        "/api/communities",
        params={
            "sync_ids": ",".join(seeded_two_cluster_syncs),
            "config": "not-json",
        },
        headers=HDR,
    )
    assert r.status_code == 400
