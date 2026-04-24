"""Integration tests for ``graph/community.py``. Uses the real Postgres +
AGE pool and real graspologic. The ``seeded_two_cluster_syncs`` fixture
plants two K4 cliques bridged by one cross-sync edge — modularity is
comfortably > 0.2 and active-set Leiden reliably recovers two communities
regardless of seed."""
import pytest

from src.graph import store
from src.graph.community import get_or_compute
from src.graph.leiden_config import LeidenConfig

pytestmark = pytest.mark.asyncio(loop_scope="session")


DEFAULT_CFG = LeidenConfig(
    resolution=1.0, beta=0.01, iterations=10, min_cluster_size=3, seed=42,
)


async def test_cache_miss_computes_and_writes(
    app_pool, seeded_two_cluster_syncs,
):
    """First call with ``force=False`` on a cold cache runs Leiden, writes
    a new row into ``leiden_cache``, and returns ``cached=False`` with at
    least two surviving communities above ``min_cluster_size=3``."""
    sync_ids = seeded_two_cluster_syncs
    r1 = await get_or_compute(
        sync_ids, DEFAULT_CFG, user_sub="u1", force=False,
    )
    assert r1.cached is False
    assert r1.summary.community_count >= 2
    assert r1.summary.modularity > 0.2
    assert r1.compute_ms >= 0
    # Community entries exist for each surviving cluster.
    assert len(r1.communities) == r1.summary.community_count
    # Default labels are "Community N" until Task 14 wires the LLM.
    assert r1.communities[0].label.startswith("Community ")
    assert len(r1.communities[0].node_ids_sample) <= 20

    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT cache_key, community_count, modularity, orphan_pct, "
            "       community_sizes, compute_ms "
            "FROM leiden_cache WHERE cache_key = $1",
            r1.cache_key,
        )
    assert row is not None
    assert row["community_count"] == r1.summary.community_count
    assert float(row["modularity"]) == r1.summary.modularity
    assert list(row["community_sizes"]) == r1.summary.community_sizes


async def test_cache_hit_is_consistent(
    app_pool, seeded_two_cluster_syncs,
):
    """A second call with the same ``(sync_ids, config)`` reads the cached
    row instead of recomputing. ``cache_key`` must match and the community
    sizes must be byte-identical."""
    sync_ids = seeded_two_cluster_syncs
    r1 = await get_or_compute(sync_ids, DEFAULT_CFG, user_sub="u1")
    r2 = await get_or_compute(sync_ids, DEFAULT_CFG, user_sub="u1")
    assert r2.cached is True
    assert r2.cache_key == r1.cache_key
    assert r2.summary.community_sizes == r1.summary.community_sizes
    assert r2.summary.community_count == r1.summary.community_count
    # Every derived summary field must round-trip byte-identically: a
    # divergence here (previously: largest_share) silently misreported
    # carousel health on every cache hit after the first.
    assert r2.summary.largest_share == r1.summary.largest_share
    assert r2.summary.orphan_pct == r1.summary.orphan_pct
    assert r2.summary.modularity == r1.summary.modularity


async def test_force_bypasses_cache(
    app_pool, seeded_two_cluster_syncs,
):
    """``force=True`` skips the cache lookup and re-runs Leiden even when
    a fresh row exists. The returned result must carry ``cached=False``."""
    sync_ids = seeded_two_cluster_syncs
    await get_or_compute(sync_ids, DEFAULT_CFG, user_sub="u1")
    r2 = await get_or_compute(
        sync_ids, DEFAULT_CFG, user_sub="u1", force=True,
    )
    assert r2.cached is False


async def test_get_assignments_streams_all_nodes(
    app_pool, seeded_two_cluster_syncs,
):
    from collections import Counter
    from src.graph.community import get_or_compute, get_assignments
    r = await get_or_compute(seeded_two_cluster_syncs, DEFAULT_CFG, user_sub="u1")
    pairs = [(n, idx) async for n, idx in get_assignments(r.cache_key)]
    assert len(pairs) >= 8  # fixture seeds 8 files
    positive_sizes = Counter(idx for _, idx in pairs if idx >= 0)
    assert sorted(positive_sizes.values(), reverse=True) == r.summary.community_sizes


async def test_get_community_nodes_paginates(
    app_pool, seeded_two_cluster_syncs,
):
    from src.graph.community import get_or_compute, get_community_nodes
    r = await get_or_compute(seeded_two_cluster_syncs, DEFAULT_CFG, user_sub="u1")
    page1 = await get_community_nodes(r.cache_key, 0, limit=2, cursor=None)
    assert len(page1.items) == 2
    assert page1.next_cursor is not None
    page2 = await get_community_nodes(
        r.cache_key, 0, limit=2, cursor=page1.next_cursor,
    )
    assert len(page2.items) >= 1
    assert set(page1.items).isdisjoint(page2.items)


async def test_get_community_nodes_empty_on_cache_miss(app_pool):
    from src.graph.community import get_community_nodes
    page = await get_community_nodes("nonexistent-key", 0, limit=10, cursor=None)
    assert page.items == []
    assert page.next_cursor is None


async def test_get_assignments_empty_on_cache_miss(app_pool):
    from src.graph.community import get_assignments
    pairs = [x async for x in get_assignments("nonexistent-key")]
    assert pairs == []


async def test_invalidate_for_sync_ids_deletes_overlapping_rows(
    app_pool, seeded_two_cluster_syncs,
):
    """Invalidating on *one* of the cached sync_ids removes the whole row —
    any overlap with the cached sync set is enough."""
    from src.graph import store
    from src.graph.community import get_or_compute, invalidate_for_sync_ids

    r = await get_or_compute(
        seeded_two_cluster_syncs, DEFAULT_CFG, user_sub="u1",
    )
    pool = store.get_pool()
    async with pool.acquire() as conn:
        before = await conn.fetchval(
            "SELECT count(*) FROM leiden_cache WHERE cache_key = $1",
            r.cache_key,
        )
    assert before == 1

    deleted = await invalidate_for_sync_ids([seeded_two_cluster_syncs[0]])
    assert deleted >= 1

    async with pool.acquire() as conn:
        after = await conn.fetchval(
            "SELECT count(*) FROM leiden_cache WHERE cache_key = $1",
            r.cache_key,
        )
    assert after == 0


async def test_invalidate_empty_sync_ids_is_noop(app_pool):
    from src.graph.community import invalidate_for_sync_ids
    assert await invalidate_for_sync_ids([]) == 0


async def test_sweep_expired_removes_past_ttl(app_pool):
    import uuid
    from src.graph import store
    from src.graph.community import sweep_expired
    pool = store.get_pool()
    stale_key = f"stale-{uuid.uuid4().hex[:12]}"
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO leiden_cache ("
            "  cache_key, user_sub, sync_ids, config, community_count, "
            "  modularity, orphan_pct, community_sizes, assignments, labels, "
            "  compute_ms, expires_at"
            ") VALUES ("
            "  $1, 'u1', ARRAY[]::uuid[], '{}'::jsonb, 0, 0, 0, "
            "  ARRAY[]::int[], '{}'::jsonb, '{}'::jsonb, 0, "
            "  now() - interval '1 hour'"
            ")",
            stale_key,
        )

    n = await sweep_expired()
    assert n >= 1

    async with pool.acquire() as conn:
        still = await conn.fetchval(
            "SELECT 1 FROM leiden_cache WHERE cache_key = $1", stale_key,
        )
    assert still is None


async def test_evict_lru_for_user_trims_to_cap(app_pool):
    """Seed 3 cache rows for a user, reduce the cap to 2, and verify that
    exactly one row (the oldest) is evicted. Restores the setting at
    teardown."""
    import uuid
    from src.config import settings
    from src.graph import store
    from src.graph.community import evict_lru_for_user

    pool = store.get_pool()
    user = f"evict-user-{uuid.uuid4().hex[:8]}"
    keys = [f"k-{uuid.uuid4().hex[:12]}" for _ in range(3)]
    original_cap = settings.leiden_cache_max_rows_per_user
    try:
        async with pool.acquire() as conn:
            for i, k in enumerate(keys):
                await conn.execute(
                    "INSERT INTO leiden_cache ("
                    "  cache_key, user_sub, sync_ids, config, community_count, "
                    "  modularity, orphan_pct, community_sizes, assignments, "
                    "  labels, compute_ms, created_at, expires_at"
                    ") VALUES ("
                    "  $1, $2, ARRAY[]::uuid[], '{}'::jsonb, 0, 0, 0, "
                    "  ARRAY[]::int[], '{}'::jsonb, '{}'::jsonb, 0, "
                    "  now() - make_interval(secs => $3::int), "
                    "  now() + interval '1 day'"
                    ")",
                    k, user, (3 - i) * 10,  # k[0] newest, k[2] oldest
                )

        settings.leiden_cache_max_rows_per_user = 2
        evicted = await evict_lru_for_user(user)
        assert evicted == 1

        async with pool.acquire() as conn:
            remaining = await conn.fetchval(
                "SELECT count(*) FROM leiden_cache WHERE user_sub = $1", user,
            )
        assert remaining == 2
    finally:
        settings.leiden_cache_max_rows_per_user = original_cap
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM leiden_cache WHERE user_sub = $1", user,
            )


async def test_labels_fallback_when_llm_down(
    app_pool, seeded_two_cluster_syncs, monkeypatch,
):
    """If ``_label_community`` raises (dense LLM unreachable), ``get_or_compute``
    must still succeed and fall back to 'Community N' for every entry. Verifies
    the fallback is per-community (not fail-closed)."""
    from src.graph import community as cm

    async def boom(*a, **kw):
        raise RuntimeError("dense LLM unreachable")

    monkeypatch.setattr(cm, "_label_community", boom)

    r = await cm.get_or_compute(
        seeded_two_cluster_syncs, DEFAULT_CFG, user_sub="u1", force=True,
    )
    assert r.summary.community_count >= 2
    for e in r.communities:
        assert e.label.startswith("Community "), e.label


async def test_labels_use_llm_reply_when_successful(
    app_pool, seeded_two_cluster_syncs, monkeypatch,
):
    """When ``_label_community`` returns a string, it lands on the entries
    (trimmed of quotes + whitespace, capped at 40 chars)."""
    from src.graph import community as cm

    async def fake(node_ids):
        return '  "Auth Handlers"  '

    monkeypatch.setattr(cm, "_label_community", fake)

    r = await cm.get_or_compute(
        seeded_two_cluster_syncs, DEFAULT_CFG, user_sub="u1", force=True,
    )
    for e in r.communities:
        assert e.label == "Auth Handlers"


async def test_labels_disabled_short_circuits(
    app_pool, seeded_two_cluster_syncs, monkeypatch,
):
    """When ``active_set_leiden_labeling_enabled=False``, the LLM path is
    never entered — labels are the default 'Community N'."""
    from src.config import settings as s
    from src.graph import community as cm

    calls = 0

    async def counted(node_ids):
        nonlocal calls
        calls += 1
        return "Should Not Appear"

    monkeypatch.setattr(cm, "_label_community", counted)
    monkeypatch.setattr(s, "active_set_leiden_labeling_enabled", False)

    r = await cm.get_or_compute(
        seeded_two_cluster_syncs, DEFAULT_CFG, user_sub="u1", force=True,
    )
    assert calls == 0
    for e in r.communities:
        assert e.label.startswith("Community ")
