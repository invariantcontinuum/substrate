"""End-to-end smoke for the active-set Leiden pipeline.

Walks: HTTP GET /api/communities on a seeded two-cluster graph → assert
cold (cached=false) → second GET → assert hit (cached=true) → publish a
sync_lifecycle {status:'cleaned'} event for one of the sync_ids → wait for
the listener to invalidate the overlapping cache row → third GET → assert
cold again.

Exercises every P1 seam end-to-end: API → LeidenConfig merging → compute →
cache write → cache read → LISTEN invalidation → SSE emit durability.
"""
from __future__ import annotations

import asyncio
import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio(loop_scope="session")


USER = "u-e2e"
HDR = {"X-User-Sub": USER}


@pytest_asyncio.fixture(loop_scope="session")
async def running_background_tasks(app_pool):
    from src.startup import start_leiden_cache_tasks, stop_leiden_cache_tasks
    await start_leiden_cache_tasks()
    # Give the listener a moment to ATTACH to substrate_sse.
    await asyncio.sleep(0.1)
    yield
    await stop_leiden_cache_tasks()


async def _wait_for(predicate, timeout_s: float = 3.0) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        if await predicate():
            return True
        await asyncio.sleep(0.05)
    return False


async def test_full_leiden_pipeline(
    async_client, seeded_two_cluster_syncs, running_background_tasks,
):
    params = {"sync_ids": ",".join(seeded_two_cluster_syncs)}

    # 1. Cold GET — cache miss, compute runs, row written.
    r1 = await async_client.get(
        "/api/communities", params=params, headers=HDR,
    )
    assert r1.status_code == 200, r1.text
    body1 = r1.json()
    assert body1["cached"] is False
    assert body1["summary"]["community_count"] >= 2
    cache_key = body1["cache_key"]

    # 2. Hit GET — same params, returns cached=true.
    r2 = await async_client.get(
        "/api/communities", params=params, headers=HDR,
    )
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["cached"] is True
    assert body2["cache_key"] == cache_key
    # Cache-hit must reproduce identical summary fields.
    assert body2["summary"] == body1["summary"]

    # 3. Simulate a sync cleanup: publish a sync_lifecycle event on
    #    substrate_sse so the running listener invalidates our row.
    from src.graph import store
    from substrate_common.sse import Event, SseBus

    pool = store.get_pool()
    bus = SseBus(pool)
    await bus.publish(Event(
        type="sync_lifecycle",
        sync_id=uuid.UUID(seeded_two_cluster_syncs[0]),
        payload={"status": "cleaned"},
    ))

    # 4. Poll: row should disappear within ~1s.
    async def _row_gone() -> bool:
        async with pool.acquire() as conn:
            still = await conn.fetchval(
                "SELECT 1 FROM leiden_cache WHERE cache_key = $1", cache_key,
            )
        return still is None
    assert await _wait_for(_row_gone, timeout_s=3.0), (
        "listener did not invalidate the cache row in 3s"
    )

    # 5. Third GET — previously cached, now cold again after invalidation.
    r3 = await async_client.get(
        "/api/communities", params=params, headers=HDR,
    )
    assert r3.status_code == 200, r3.text
    body3 = r3.json()
    assert body3["cached"] is False
    # New key only if params changed. Same sync_ids + default config still
    # produce the same canonical hash — so cache_key matches; `cached` is
    # the authoritative signal.
    assert body3["cache_key"] == cache_key


async def test_sse_emissions_match_compute_path(
    async_client, seeded_two_cluster_syncs, running_background_tasks,
):
    """After a cold run, sse_events must contain 4 leiden.compute rows for
    this run. This is the integration proof that the SSE emit seam is
    reachable over HTTP, not just in-process."""
    from src.graph import store

    HDR_UNIQ = {"X-User-Sub": f"u-e2e-sse-{uuid.uuid4().hex[:6]}"}
    r = await async_client.post(
        "/api/communities/recompute",
        json={
            "sync_ids": list(seeded_two_cluster_syncs),
            "config": {
                "resolution": 1.0, "beta": 0.01, "iterations": 10,
                "min_cluster_size": 3, "seed": 42,
            },
        },
        headers=HDR_UNIQ,
    )
    assert r.status_code == 200, r.text
    cache_key = r.json()["cache_key"]

    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT payload FROM sse_events "
            "WHERE type = 'leiden.compute' "
            "  AND user_sub = $1 "
            "  AND payload->>'cache_key' = $2 "
            "ORDER BY id ASC",
            HDR_UNIQ["X-User-Sub"], cache_key,
        )
    phases = [r["payload"]["phase"] if isinstance(r["payload"], dict)
              else __import__("json").loads(r["payload"])["phase"]
              for r in rows]
    assert phases == [
        "building_graph", "running_leiden", "labeling", "writing_cache",
    ]
