import json
import pytest
import pytest_asyncio
from src import graph_writer

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup(graph_pool):
    await graph_writer.connect(
        "postgresql://substrate_graph:changeme@localhost:5432/substrate_graph"
    )
    yield
    await graph_writer.disconnect()


async def test_ensure_source_idempotent():
    a = await graph_writer.ensure_source("github_repo", "octo", "demo", "https://x")
    b = await graph_writer.ensure_source("github_repo", "octo", "demo", "https://x")
    assert a == b
    async with graph_writer._pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE owner='octo' AND name='demo'")


async def test_cleanup_partial_removes_all_traces():
    pool = graph_writer._pool
    # Pre-clean any leftover state from failed previous runs
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE owner='octo' AND name='cleanup'")
    src_id = await graph_writer.ensure_source("github_repo", "octo", "cleanup", "u")
    async with pool.acquire() as conn:
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status) VALUES ($1::uuid, 'running') RETURNING id::text",
            src_id,
        )
        file_id = await conn.fetchval(
            """INSERT INTO file_embeddings (sync_id, source_id, file_path, name, type)
               VALUES ($1::uuid, $2::uuid, 'a.py', 'a.py', 'source') RETURNING id::text""",
            sync_id, src_id,
        )
        await conn.execute(
            """INSERT INTO content_chunks (file_id, sync_id, chunk_index, content, start_line, end_line, token_count)
               VALUES ($1::uuid, $2::uuid, 0, 'x', 1, 1, 1)""",
            file_id, sync_id,
        )
        await conn.execute(
            f"SELECT * FROM cypher('substrate', $$ CREATE (n:File {{file_id: '{file_id}', sync_id: '{sync_id}'}}) $$) AS (v agtype)"
        )

    await graph_writer.cleanup_partial(sync_id)

    async with pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM file_embeddings WHERE sync_id = $1::uuid", sync_id) == 0
        assert await conn.fetchval("SELECT count(*) FROM content_chunks WHERE sync_id = $1::uuid", sync_id) == 0
        cnt = await conn.fetchval(
            f"SELECT count(*) FROM cypher('substrate', $$ MATCH (n) WHERE n.sync_id = '{sync_id}' RETURN n $$) AS (n agtype)"
        )
        cnt_int = int(json.loads(str(cnt))) if cnt is not None else 0
        assert cnt_int == 0
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", src_id)
