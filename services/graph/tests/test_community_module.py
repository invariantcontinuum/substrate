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
