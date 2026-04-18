import asyncio
import uuid
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from src.sync_runs import ensure_active_sync


@pytest.mark.asyncio
async def test_returns_new_id_when_insert_succeeds():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={"id": "new-sync-id"})
    sync_id, created = await ensure_active_sync(
        conn,
        source_id="00000000-0000-0000-0000-000000000001",
        config_snapshot={"branch": "main"},
        triggered_by="user",
    )
    assert (sync_id, created) == ("new-sync-id", True)


@pytest.mark.asyncio
async def test_returns_existing_id_when_conflict():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.fetchval = AsyncMock(return_value="existing-sync-id")
    sync_id, created = await ensure_active_sync(
        conn,
        source_id="00000000-0000-0000-0000-000000000001",
        config_snapshot={"branch": "main"},
        triggered_by="scheduler",
    )
    assert (sync_id, created) == ("existing-sync-id", False)


@pytest.mark.asyncio
async def test_retries_once_if_conflict_clears_between_insert_and_select():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(side_effect=[None, {"id": "retry-id"}])
    conn.fetchval = AsyncMock(return_value=None)
    sync_id, created = await ensure_active_sync(
        conn,
        source_id="00000000-0000-0000-0000-000000000001",
        config_snapshot={"branch": "main"},
        triggered_by="user",
    )
    assert (sync_id, created) == ("retry-id", True)


@pytest.mark.asyncio
async def test_raises_runtime_error_if_conflict_without_existing_row_twice():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(side_effect=[None, None])
    conn.fetchval = AsyncMock(return_value=None)
    with pytest.raises(RuntimeError, match="ON CONFLICT fired twice"):
        await ensure_active_sync(
            conn,
            source_id="00000000-0000-0000-0000-000000000001",
            config_snapshot={"branch": "main"},
            triggered_by="user",
        )


@pytest.mark.asyncio
async def test_passes_schedule_id_when_provided():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={"id": "sched-sync-id"})
    sync_id, created = await ensure_active_sync(
        conn,
        source_id="00000000-0000-0000-0000-000000000001",
        config_snapshot={"branch": "main"},
        triggered_by="schedule",
        schedule_id=42,
    )
    assert (sync_id, created) == ("sched-sync-id", True)
    # The second positional arg (after the SQL string) is source_id; schedule_id
    # should appear as the fourth bind arg.
    call = conn.fetchrow.call_args
    args = call.args
    # args[0] is the SQL, args[1:] are bind values:
    assert args[1] == "00000000-0000-0000-0000-000000000001"
    assert args[4] == 42


@pytest.mark.asyncio
async def test_schedule_id_defaults_to_none():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={"id": "user-sync-id"})
    await ensure_active_sync(
        conn,
        source_id="00000000-0000-0000-0000-000000000001",
        config_snapshot={"branch": "main"},
        triggered_by="user",
    )
    args = conn.fetchrow.call_args.args
    assert args[4] is None


@pytest_asyncio.fixture
async def clean_source(graph_pool):
    """Create a throwaway source row and yield its id; clean up on teardown."""
    source_id = str(uuid.uuid4())
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, source_type, owner, name, url) "
            "VALUES ($1::uuid, 'github_repo', 'test', $2, $3)",
            source_id, f"ensure-active-{source_id}",
            f"https://example.test/{source_id}",
        )
    yield source_id
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sync_runs WHERE source_id = $1::uuid", source_id
        )
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", source_id)


@pytest.mark.asyncio
async def test_concurrent_creates_yield_single_row(graph_pool, clean_source):
    async def one_caller():
        async with graph_pool.acquire() as conn:
            return await ensure_active_sync(
                conn,
                source_id=clean_source,
                config_snapshot={"branch": "main"},
                triggered_by="user",
            )

    results = await asyncio.gather(one_caller(), one_caller(), one_caller())
    created_flags = [r[1] for r in results]
    sync_ids = {r[0] for r in results}

    assert sum(created_flags) == 1            # exactly one created
    assert len(sync_ids) == 1                 # all callers got the same id

    async with graph_pool.acquire() as conn:
        row_count = await conn.fetchval(
            "SELECT count(*) FROM sync_runs "
            "WHERE source_id = $1::uuid AND status IN ('pending','running')",
            clean_source,
        )
    assert row_count == 1
