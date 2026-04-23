"""Verify new leiden_cache + user_preferences tables exist with expected columns."""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_leiden_cache_exists(db):
    row = await db.fetchrow(
        "SELECT to_regclass('public.leiden_cache') AS t"
    )
    assert row["t"] is not None, "leiden_cache table not present"


async def test_leiden_cache_columns(db):
    cols = await db.fetch(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'leiden_cache' ORDER BY ordinal_position"
    )
    names = [c["column_name"] for c in cols]
    for expected in ("cache_key", "user_sub", "sync_ids", "config",
                     "community_count", "modularity", "orphan_pct",
                     "community_sizes", "assignments", "labels",
                     "compute_ms", "created_at", "expires_at"):
        assert expected in names, f"missing column {expected}"


async def test_leiden_cache_gin_index(db):
    row = await db.fetchrow(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'leiden_cache' AND indexname = 'idx_leiden_cache_sync_ids'"
    )
    assert row is not None, "GIN index on sync_ids missing"


async def test_user_preferences_exists(db):
    row = await db.fetchrow(
        "SELECT to_regclass('public.user_preferences') AS t"
    )
    assert row["t"] is not None, "user_preferences table not present"
