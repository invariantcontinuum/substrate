import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone

from src import graph_writer
from src.sync_runs import ensure_active_sync
from src.scheduler import claim_due_schedules_once

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup(graph_pool):
    if graph_writer._pool is None:
        from tests.conftest import graph_dsn
        await graph_writer.connect(graph_dsn())
    yield


@pytest_asyncio.fixture
async def clean_source_with_schedule(graph_pool):
    """Insert a source + due schedule; clean up sync_runs, schedules, source on teardown."""
    source_id = str(uuid.uuid4())
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, source_type, owner, name, url) "
            "VALUES ($1::uuid, 'github_repo', 'test', $2, $3)",
            source_id,
            f"sched-race-{source_id}",
            f"https://example.test/{source_id}",
        )
        schedule_id = await conn.fetchval(
            "INSERT INTO sync_schedules "
            "(source_id, config_overrides, interval_minutes, next_run_at) "
            "VALUES ($1::uuid, '{}'::jsonb, 1, NOW() - INTERVAL '1 minute') "
            "RETURNING id",
            source_id,
        )
    yield {"source_id": source_id, "schedule_id": schedule_id}
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sync_runs WHERE source_id = $1::uuid", source_id
        )
        await conn.execute(
            "DELETE FROM sync_schedules WHERE source_id = $1::uuid", source_id
        )
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", source_id)


async def test_scheduler_creates_sync_run_for_due_schedule(
    graph_pool, clean_source_with_schedule
):
    """Scheduler tick creates exactly one pending sync_run for a due schedule."""
    source_id = clean_source_with_schedule["source_id"]

    await claim_due_schedules_once()

    async with graph_pool.acquire() as conn:
        active_count = await conn.fetchval(
            "SELECT count(*) FROM sync_runs "
            "WHERE source_id = $1::uuid AND status IN ('pending','running')",
            source_id,
        )
    assert active_count == 1

    async with graph_pool.acquire() as conn:
        next_run_at = await conn.fetchval(
            "SELECT next_run_at FROM sync_schedules WHERE source_id = $1::uuid",
            source_id,
        )
    assert next_run_at > datetime.now(timezone.utc), \
        "next_run_at should have advanced past now after claim"


async def test_scheduler_does_not_duplicate_when_user_sync_already_active(
    graph_pool, clean_source_with_schedule
):
    """When a user-triggered sync is already active, a scheduler tick must not
    create a second row — it should log scheduler_sync_already_active and move on.
    """
    source_id = clean_source_with_schedule["source_id"]

    # Seed an active user-triggered sync before the tick runs.
    async with graph_pool.acquire() as conn:
        user_sync_id, created = await ensure_active_sync(
            conn,
            source_id=source_id,
            config_snapshot={"branch": "main"},
            triggered_by="user",
        )
    assert created, "pre-condition: user sync should have been created"

    # Run one scheduler tick — the due schedule is still due because claim_due_schedules
    # advances next_run_at; but the user-triggered sync is already active.
    # We reset next_run_at back so the schedule is picked up again.
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "UPDATE sync_schedules SET next_run_at = NOW() - INTERVAL '1 minute' "
            "WHERE source_id = $1::uuid",
            source_id,
        )

    await claim_due_schedules_once()

    # Only the original user sync must exist in active state.
    async with graph_pool.acquire() as conn:
        active_count = await conn.fetchval(
            "SELECT count(*) FROM sync_runs "
            "WHERE source_id = $1::uuid AND status IN ('pending','running')",
            source_id,
        )
        active_id = await conn.fetchval(
            "SELECT id::text FROM sync_runs "
            "WHERE source_id = $1::uuid AND status IN ('pending','running')",
            source_id,
        )
    assert active_count == 1, (
        f"expected exactly 1 active sync_run, got {active_count}"
    )
    assert active_id == user_sync_id, (
        "the surviving active sync must be the original user sync, not a scheduler duplicate"
    )
