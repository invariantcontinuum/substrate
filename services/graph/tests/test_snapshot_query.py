import pytest
import pytest_asyncio
from src.graph import store, snapshot_query

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup():
    if store._pool is None:
        await store.connect()
    yield


async def test_merged_graph_marks_divergent_when_content_differs():
    pool = store._pool
    async with pool.acquire() as conn:
        # Pre-clean any leftover from prior failed runs.
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' AND owner='o' AND name='merge'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) VALUES ('github_repo','o','merge','u') RETURNING id::text"
        )
        sid_a = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) VALUES ($1::uuid, 'completed', '2026-04-10') RETURNING id::text",
            src_id,
        )
        sid_b = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) VALUES ($1::uuid, 'completed', '2026-04-15') RETURNING id::text",
            src_id,
        )
        # Same path, different content_hash => divergent.
        await conn.execute(
            """INSERT INTO file_embeddings (sync_id, source_id, file_path, name, type, content_hash)
               VALUES ($1::uuid, $2::uuid, 'a.py', 'a.py', 'source', 'aaaa')""",
            sid_a, src_id,
        )
        await conn.execute(
            """INSERT INTO file_embeddings (sync_id, source_id, file_path, name, type, content_hash)
               VALUES ($1::uuid, $2::uuid, 'a.py', 'a.py', 'source', 'bbbb')""",
            sid_b, src_id,
        )

    snap = await snapshot_query.get_merged_graph([sid_a, sid_b])
    nodes = snap["nodes"]
    assert len(nodes) == 1, f"expected one merged node, got {len(nodes)}"
    n = nodes[0]["data"]
    assert n["divergent"] is True
    assert n["latest_sync_id"] == sid_b
    assert sorted(n["loaded_sync_ids"]) == sorted([sid_a, sid_b])

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)
