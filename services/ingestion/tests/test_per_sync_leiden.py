"""Integration test for per_sync_leiden — real AGE + real graspologic."""
import json
import uuid

import pytest
import pytest_asyncio

from src import graph_writer
from src.jobs.per_sync_leiden import per_sync_leiden
from tests.conftest import graph_dsn

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _writer_connected():
    if graph_writer._pool is None:
        await graph_writer.connect(graph_dsn())
    yield


async def _seed_clustered(graph_pool):
    """Plant 8 File nodes split 4+4 with intra-cluster K4 edges + 1 bridge.
    Returns (sync_id, source_id, cleanup_async)."""
    source_id = str(uuid.uuid4())
    sync_id = str(uuid.uuid4())
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, user_sub, source_type, owner, name, url) "
            "VALUES ($1::uuid, 'u1', 'github_repo', 'o', 'r', 'https://x')",
            source_id,
        )
        await conn.execute(
            "INSERT INTO sync_runs (id, source_id, status) VALUES ($1::uuid, $2::uuid, 'running')",
            sync_id, source_id,
        )

    nodes = [
        {"file_id": f"{sync_id}-a{i}", "name": f"a{i}.py", "type": "code", "domain": "src"}
        for i in range(4)
    ] + [
        {"file_id": f"{sync_id}-b{i}", "name": f"b{i}.py", "type": "code", "domain": "src"}
        for i in range(4)
    ]
    # Intra-cluster complete graphs: K4 on a-side, K4 on b-side.
    edges = []
    for i in range(4):
        for j in range(i + 1, 4):
            edges.append({"source_id": f"{sync_id}-a{i}", "target_id": f"{sync_id}-a{j}", "weight": 1.0})
            edges.append({"source_id": f"{sync_id}-b{i}", "target_id": f"{sync_id}-b{j}", "weight": 1.0})
    # One bridge between the clusters.
    edges.append({"source_id": f"{sync_id}-a0", "target_id": f"{sync_id}-b0", "weight": 1.0})

    assert await graph_writer.write_age_nodes(nodes, sync_id, source_id) == 0
    assert await graph_writer.write_age_edges(edges, sync_id, source_id) == 0

    async def cleanup():
        await graph_writer.cleanup_partial(sync_id)
        async with graph_pool.acquire() as c:
            await c.execute("DELETE FROM sync_runs WHERE id = $1::uuid", sync_id)
            await c.execute("DELETE FROM sources WHERE id = $1::uuid", source_id)

    return sync_id, source_id, cleanup


@pytest_asyncio.fixture
async def seeded_clustered_sync(graph_pool):
    sync_id, _src, cleanup = await _seed_clustered(graph_pool)
    yield sync_id
    await cleanup()


async def test_per_sync_leiden_finds_two_clusters(seeded_clustered_sync, graph_pool):
    await per_sync_leiden(seeded_clustered_sync)
    async with graph_pool.acquire() as conn:
        stats = await conn.fetchval(
            "SELECT stats FROM sync_runs WHERE id = $1::uuid", seeded_clustered_sync,
        )
    parsed = json.loads(stats) if isinstance(stats, str) else stats
    assert parsed["leiden"]["count"] == 2
    assert parsed["leiden"]["modularity"] > 0.2
    assert len(parsed["leiden"]["community_sizes"]) == 2
    assert sum(parsed["leiden"]["community_sizes"]) == 8


async def test_per_sync_leiden_deterministic(seeded_clustered_sync, graph_pool):
    await per_sync_leiden(seeded_clustered_sync)
    async with graph_pool.acquire() as conn:
        s1 = await conn.fetchval(
            "SELECT stats FROM sync_runs WHERE id = $1::uuid", seeded_clustered_sync,
        )
    await per_sync_leiden(seeded_clustered_sync)
    async with graph_pool.acquire() as conn:
        s2 = await conn.fetchval(
            "SELECT stats FROM sync_runs WHERE id = $1::uuid", seeded_clustered_sync,
        )
    p1 = json.loads(s1) if isinstance(s1, str) else s1
    p2 = json.loads(s2) if isinstance(s2, str) else s2
    assert p1["leiden"]["community_sizes"] == p2["leiden"]["community_sizes"]
    assert abs(p1["leiden"]["modularity"] - p2["leiden"]["modularity"]) < 1e-9


async def test_per_sync_leiden_tiny_graph_note(graph_pool):
    source_id = str(uuid.uuid4())
    sync_id = str(uuid.uuid4())
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, user_sub, source_type, owner, name, url) "
            "VALUES ($1::uuid, 'u1', 'github_repo', 'o', 'r', 'https://x')",
            source_id,
        )
        await conn.execute(
            "INSERT INTO sync_runs (id, source_id, status) VALUES ($1::uuid, $2::uuid, 'running')",
            sync_id, source_id,
        )
    nodes = [{"file_id": f"{sync_id}-only", "name": "only.py", "type": "code", "domain": "src"}]
    assert await graph_writer.write_age_nodes(nodes, sync_id, source_id) == 0

    try:
        await per_sync_leiden(sync_id)
        async with graph_pool.acquire() as conn:
            stats = await conn.fetchval(
                "SELECT stats FROM sync_runs WHERE id = $1::uuid", sync_id,
            )
        parsed = json.loads(stats) if isinstance(stats, str) else stats
        assert parsed["leiden"]["count"] == 0
        assert parsed["leiden"].get("note") == "too_small"
    finally:
        await graph_writer.cleanup_partial(sync_id)
        async with graph_pool.acquire() as c:
            await c.execute("DELETE FROM sync_runs WHERE id = $1::uuid", sync_id)
            await c.execute("DELETE FROM sources WHERE id = $1::uuid", source_id)


async def test_per_sync_leiden_handles_isolated_nodes(graph_pool):
    """Regression: a sync whose graph includes isolated :File nodes (no
    DEPENDS_ON edges) must compute modularity without raising. Before
    the fix, nx_modularity rejected the partition because isolated nodes
    weren't covered by any non-orphan community."""
    from src import graph_writer
    from src.jobs.per_sync_leiden import per_sync_leiden
    import json
    import uuid

    source_id = str(uuid.uuid4())
    sync_id = str(uuid.uuid4())
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, user_sub, source_type, owner, name, url) "
            "VALUES ($1::uuid, 'u1', 'github_repo', 'o', 'r-iso', 'https://x')",
            source_id,
        )
        await conn.execute(
            "INSERT INTO sync_runs (id, source_id, status) "
            "VALUES ($1::uuid, $2::uuid, 'running')",
            sync_id, source_id,
        )

    # 4-node K4 cluster + 6 isolated nodes (no edges).
    nodes = [
        {"file_id": f"{sync_id}-c{i}", "name": f"c{i}.py",
         "type": "code", "domain": "src"}
        for i in range(4)
    ] + [
        {"file_id": f"{sync_id}-iso{i}", "name": f"iso{i}.py",
         "type": "code", "domain": "src"}
        for i in range(6)
    ]
    edges = []
    for i in range(4):
        for j in range(i + 1, 4):
            edges.append({
                "source_id": f"{sync_id}-c{i}",
                "target_id": f"{sync_id}-c{j}",
                "weight": 1.0,
            })

    assert await graph_writer.write_age_nodes(nodes, sync_id, source_id) == 0
    assert await graph_writer.write_age_edges(edges, sync_id, source_id) == 0

    try:
        await per_sync_leiden(sync_id)
        async with graph_pool.acquire() as conn:
            stats = await conn.fetchval(
                "SELECT stats FROM sync_runs WHERE id = $1::uuid", sync_id,
            )
            issues = await conn.fetch(
                "SELECT code FROM sync_issues WHERE sync_id = $1::uuid",
                sync_id,
            )
        parsed = json.loads(stats) if isinstance(stats, str) else (stats or {})
        leiden = parsed.get("leiden")
        assert leiden is not None, (
            "stats.leiden must be populated — the compute should succeed"
        )
        # Exactly one surviving cluster (the 4-node clique), or zero if
        # graspologic's hierarchical pass split it below min_cluster_size.
        assert isinstance(leiden["count"], int)
        assert isinstance(leiden["modularity"], float)
        # No per_sync_leiden_failed warning should land — the compute
        # succeeded end-to-end.
        codes = [r["code"] for r in issues]
        assert "per_sync_leiden_failed" not in codes, (
            f"expected no leiden failure, got issues: {codes}"
        )
    finally:
        await graph_writer.cleanup_partial(sync_id)
        async with graph_pool.acquire() as c:
            await c.execute("DELETE FROM sync_runs WHERE id = $1::uuid", sync_id)
            await c.execute("DELETE FROM sources WHERE id = $1::uuid", source_id)
            await c.execute("DELETE FROM sync_issues WHERE sync_id = $1::uuid", sync_id)
