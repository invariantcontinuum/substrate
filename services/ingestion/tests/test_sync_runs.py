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


async def test_cancel_then_cleanup_partial_leaves_no_orphans():
    """Manually simulate a partial sync, then cancel + cleanup, assert no rows remain."""
    src_id = await graph_writer.ensure_source("github_repo", "octo", "cancel_clean", "u")
    pool = graph_writer._pool
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE source_id = $1::uuid", src_id)
    sid = await sync_runs.create_sync_run(src_id, {}, "user")
    await sync_runs.claim_sync_run(sid)
    # Simulate partial writes during sync
    async with pool.acquire() as conn:
        file_id = await conn.fetchval(
            """INSERT INTO file_embeddings (sync_id, source_id, file_path, name, type)
               VALUES ($1::uuid, $2::uuid, 'a.py', 'a.py', 'source') RETURNING id::text""",
            sid, src_id,
        )
        await conn.execute(
            """INSERT INTO content_chunks (file_id, sync_id, chunk_index, content, start_line, end_line, token_count)
               VALUES ($1::uuid, $2::uuid, 0, 'x', 1, 1, 1)""",
            file_id, sid,
        )
        await conn.execute(
            f"SELECT * FROM cypher('substrate', $$ CREATE (n:File {{file_id: '{file_id}', sync_id: '{sid}'}}) $$) AS (v agtype)"
        )
    # Cancel + cleanup (mirrors what cancel_sync API + handle_sync's CancelledSync handler do)
    await sync_runs.cancel_sync_run(sid, "user requested")
    await graph_writer.cleanup_partial(sid)
    # Verify
    async with pool.acquire() as conn:
        assert await conn.fetchval("SELECT count(*) FROM file_embeddings WHERE sync_id=$1::uuid", sid) == 0
        assert await conn.fetchval("SELECT count(*) FROM content_chunks WHERE sync_id=$1::uuid", sid) == 0
        cnt = await conn.fetchval(
            f"SELECT count(*) FROM cypher('substrate', $$ MATCH (n) WHERE n.sync_id = '{sid}' RETURN n $$) AS (n agtype)"
        )
        import json as _j
        cnt_int = int(_j.loads(str(cnt))) if cnt is not None else 0
        assert cnt_int == 0
        # The cancel issue should have been recorded
        assert await conn.fetchval(
            "SELECT count(*) FROM sync_issues WHERE sync_id=$1::uuid AND code='sync_cancelled'", sid
        ) == 1
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


async def test_retry_preserves_config_snapshot():
    """A retried sync MUST use the original row's config_snapshot, not the source's current config."""
    src_id = await graph_writer.ensure_source("github_repo", "octo", "retry_cfg", "u")
    pool = graph_writer._pool
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE source_id = $1::uuid", src_id)
    original_snapshot = {"branch": "feature-x", "depth": 1}
    original_id = await sync_runs.create_sync_run(src_id, original_snapshot, "user")
    # Mark original as failed (terminal state) so retry creates a new row
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sync_runs SET status='failed', completed_at=now() WHERE id=$1::uuid", original_id
        )
        # Bump the source's current config to something different
        import json as _j
        await conn.execute(
            "UPDATE sources SET config=$2::jsonb WHERE id=$1::uuid",
            src_id, _j.dumps({"branch": "main", "depth": 0}),
        )
    # Retry: read original snapshot + create a new row with same snapshot.
    # (Mirrors what the /api/syncs/{id}/retry endpoint does.)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT source_id::text, config_snapshot FROM sync_runs WHERE id=$1::uuid", original_id
        )
    import json as _j_snap
    raw_snap = row["config_snapshot"]
    if isinstance(raw_snap, dict):
        snapshot = raw_snap
    elif isinstance(raw_snap, str):
        snapshot = _j_snap.loads(raw_snap)
    else:
        snapshot = {}
    new_id = await sync_runs.create_sync_run(row["source_id"], snapshot, f"retry:{original_id}")
    # Verify the new row's snapshot matches the original, not the source's current config
    async with pool.acquire() as conn:
        new_snapshot_raw = await conn.fetchval("SELECT config_snapshot FROM sync_runs WHERE id=$1::uuid", new_id)
        import json as _j2
        if isinstance(new_snapshot_raw, dict):
            new_snapshot = new_snapshot_raw
        elif isinstance(new_snapshot_raw, str):
            new_snapshot = _j2.loads(new_snapshot_raw)
        else:
            new_snapshot = {}
        assert new_snapshot == original_snapshot, f"retry should use original snapshot, got {new_snapshot}"
        triggered = await conn.fetchval("SELECT triggered_by FROM sync_runs WHERE id=$1::uuid", new_id)
        assert triggered == f"retry:{original_id}"
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)
