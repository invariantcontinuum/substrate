"""Integration test: on a cache-MISS run, community.get_or_compute emits
four leiden.compute events into sse_events with expected type+payload."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


_EXPECTED_PHASES = ["building_graph", "running_leiden", "labeling", "writing_cache"]


async def test_cache_miss_emits_four_phase_events(
    app_pool, seeded_two_cluster_syncs,
):
    from src.graph import store
    from src.graph.community import get_or_compute
    from src.graph.leiden_config import LeidenConfig

    pool = store.get_pool()
    user_sub = "u-sse-test"
    cfg = LeidenConfig(
        resolution=1.0, beta=0.01, iterations=10,
        min_cluster_size=3, seed=42,
    )

    # Force a miss so the emitters fire.
    r = await get_or_compute(
        seeded_two_cluster_syncs, cfg, user_sub=user_sub, force=True,
    )
    rows = await _fetch_leiden_events_for_user(pool, user_sub, r.cache_key)

    assert r.cached is False
    # Each cache-miss run emits exactly four events.
    assert len(rows) == len(_EXPECTED_PHASES), rows
    phases = [row["payload"]["phase"] for row in rows]
    assert phases == _EXPECTED_PHASES
    for row in rows:
        assert row["type"] == "leiden.compute"
        assert row["user_sub"] == user_sub
        assert row["payload"]["cache_key"] == r.cache_key
        assert row["payload"]["sync_ids"] == list(seeded_two_cluster_syncs)


async def test_cache_hit_emits_nothing(
    app_pool, seeded_two_cluster_syncs,
):
    from src.graph import store
    from src.graph.community import get_or_compute
    from src.graph.leiden_config import LeidenConfig

    pool = store.get_pool()
    user_sub = "u-sse-hit-test"
    cfg = LeidenConfig(
        resolution=1.0, beta=0.01, iterations=10,
        min_cluster_size=3, seed=42,
    )
    # Warm the cache.
    await get_or_compute(
        seeded_two_cluster_syncs, cfg, user_sub=user_sub, force=True,
    )
    # Now read from cache — no events expected this time.
    r2 = await get_or_compute(
        seeded_two_cluster_syncs, cfg, user_sub=user_sub, force=False,
    )
    assert r2.cached is True
    after_rows = await _fetch_leiden_events_for_user(
        pool, user_sub, r2.cache_key,
    )
    assert len(after_rows) == 4, "cache hit must not add events"


async def _fetch_leiden_events_for_user(pool, user_sub, cache_key):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, type, sync_id, user_sub, payload FROM sse_events "
            "WHERE type = 'leiden.compute' AND user_sub = $1 "
            "  AND payload->>'cache_key' = $2 "
            "ORDER BY id ASC",
            user_sub, cache_key,
        )
    # asyncpg decodes jsonb via the codec into dict already.
    import json as _json
    out = []
    for row in rows:
        payload = row["payload"]
        if isinstance(payload, str):
            payload = _json.loads(payload)
        out.append({
            "id": row["id"],
            "type": row["type"],
            "sync_id": str(row["sync_id"]) if row["sync_id"] else None,
            "user_sub": row["user_sub"],
            "payload": payload,
        })
    return out
