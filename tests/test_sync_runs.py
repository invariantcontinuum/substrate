import json
import pytest
import pytest_asyncio
import asyncpg
from src import graph_writer, sync_runs

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup(graph_pool):
    if graph_writer._pool is None:
        from tests.conftest import graph_dsn
        await graph_writer.connect(graph_dsn())
    yield
    await graph_writer.disconnect()


async def test_create_then_claim_then_complete():
    src_id = await graph_writer.ensure_source("github_repo", "octo", "lifecycle", "u")
    # Pre-cleanup any prior runs for this source so partial unique index doesn't reject
    async with graph_writer._pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE source_id = $1::uuid", src_id)
    sid = await sync_runs.create_sync_run(src_id, {"branch": "main"}, "user")
    assert await sync_runs.claim_sync_run(sid) is True
    await sync_runs.complete_sync_run(sid, {"nodes": 5})
    async with graph_writer._pool.acquire() as conn:
        row = await conn.fetchrow("SELECT status, stats FROM sync_runs WHERE id = $1::uuid", sid)
        assert row["status"] == "completed"
        assert json.loads(row["stats"])["nodes"] == 5
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", src_id)


async def test_concurrent_create_for_same_source_409():
    src_id = await graph_writer.ensure_source("github_repo", "octo", "concur", "u")
    async with graph_writer._pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE source_id = $1::uuid", src_id)
    await sync_runs.create_sync_run(src_id, {}, "user")
    with pytest.raises(asyncpg.UniqueViolationError):
        await sync_runs.create_sync_run(src_id, {}, "user")
    async with graph_writer._pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", src_id)


async def test_check_sync_status_reads_current():
    src_id = await graph_writer.ensure_source("github_repo", "octo", "status", "u")
    async with graph_writer._pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE source_id = $1::uuid", src_id)
    sid = await sync_runs.create_sync_run(src_id, {}, "user")
    await sync_runs.claim_sync_run(sid)
    assert await sync_runs.check_sync_status(sid) == "running"
    await sync_runs.cancel_sync_run(sid, "user requested")
    assert await sync_runs.check_sync_status(sid) == "cancelled"
    async with graph_writer._pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", src_id)
