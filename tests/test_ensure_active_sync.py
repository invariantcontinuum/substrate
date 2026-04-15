import pytest
from unittest.mock import AsyncMock

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
