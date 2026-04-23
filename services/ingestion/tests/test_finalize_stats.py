"""Integration test for finalize_stats — real Postgres + AGE, no mocks."""
import json
import uuid

import pytest
import pytest_asyncio

from src import graph_writer
from src.jobs.finalize_stats import finalize_stats
from tests.conftest import graph_dsn

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _writer_connected():
    if graph_writer._pool is None:
        await graph_writer.connect(graph_dsn())
    yield


@pytest_asyncio.fixture
async def seeded_sync(graph_pool):
    """Seeds one source, one sync_run with phase_timings, 3 File nodes, 2 DEPENDS_ON edges.
    Yields the sync_id string. Cleans up AGE + relational rows at teardown."""
    source_id = str(uuid.uuid4())
    sync_id = str(uuid.uuid4())
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, user_sub, source_type, owner, name, url) "
            "VALUES ($1::uuid, 'u1', 'github_repo', 'o', 'r', 'https://x')",
            source_id,
        )
        await conn.execute(
            """INSERT INTO sync_runs (id, source_id, status, progress_meta)
               VALUES ($1::uuid, $2::uuid, 'running',
                       '{"phase_timings":{"cloning":100,"parsing":200,
                                          "graphing":300,"embedding_chunks":400}}'::jsonb)""",
            sync_id, source_id,
        )

    nodes = [
        {"file_id": f"{sync_id}-f{i}", "name": f"f{i}.py",
         "type": "code", "domain": "src"}
        for i in range(3)
    ]
    edges = [
        {"source_id": f"{sync_id}-f0", "target_id": f"{sync_id}-f1", "weight": 1.0},
        {"source_id": f"{sync_id}-f1", "target_id": f"{sync_id}-f2", "weight": 1.0},
    ]
    assert await graph_writer.write_age_nodes(nodes, sync_id, source_id) == 0
    assert await graph_writer.write_age_edges(edges, sync_id, source_id) == 0

    yield sync_id

    # teardown: drop AGE + relational rows, and the source
    await graph_writer.cleanup_partial(sync_id)
    async with graph_pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE id = $1::uuid", sync_id)
        await conn.execute("DELETE FROM sources  WHERE id = $1::uuid", source_id)


async def test_finalize_stats_populates_counts(seeded_sync, graph_pool):
    await finalize_stats(seeded_sync)
    async with graph_pool.acquire() as conn:
        stats = await conn.fetchval(
            "SELECT stats FROM sync_runs WHERE id = $1::uuid", seeded_sync,
        )
    parsed = json.loads(stats) if isinstance(stats, str) else stats
    assert parsed["counts"]["node_count"] == 3
    assert parsed["counts"]["edge_count"] == 2
    # "File" vlabel -> by_label key; node.type property -> by_type key.
    assert parsed["counts"]["by_label"]["File"] == 3
    assert parsed["counts"]["by_type"]["code"] == 3
    assert parsed["counts"]["by_relation"]["DEPENDS_ON"] == 2
    assert parsed["schema_version"] == 1


async def test_finalize_stats_populates_timing(seeded_sync, graph_pool):
    await finalize_stats(seeded_sync)
    async with graph_pool.acquire() as conn:
        stats = await conn.fetchval(
            "SELECT stats FROM sync_runs WHERE id = $1::uuid", seeded_sync,
        )
    parsed = json.loads(stats) if isinstance(stats, str) else stats
    assert parsed["timing"]["phase_ms"]["parsing"] == 200
    assert parsed["timing"]["total_ms"] == 1000


async def test_finalize_stats_idempotent(seeded_sync, graph_pool):
    await finalize_stats(seeded_sync)
    await finalize_stats(seeded_sync)  # second run must not crash
    async with graph_pool.acquire() as conn:
        stats = await conn.fetchval(
            "SELECT stats FROM sync_runs WHERE id = $1::uuid", seeded_sync,
        )
    parsed = json.loads(stats) if isinstance(stats, str) else stats
    assert parsed["counts"]["node_count"] == 3
