"""Integration tests for the Leiden cache background tasks. Uses the real
substrate_sse channel end-to-end: publish a sync_lifecycle event with
status='completed', assert the overlapping cache row disappears."""
from __future__ import annotations

import asyncio
import uuid

import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(loop_scope="session")
async def running_listener(app_pool):
    from src.startup import start_leiden_cache_tasks, stop_leiden_cache_tasks
    await start_leiden_cache_tasks()
    # Give the listener a moment to register with Postgres.
    await asyncio.sleep(0.1)
    yield
    await stop_leiden_cache_tasks()


async def _insert_cache_row(pool, sync_id: str) -> str:
    key = f"bg-{uuid.uuid4().hex[:10]}"
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO leiden_cache ("
            "  cache_key, user_sub, sync_ids, config, community_count, "
            "  modularity, orphan_pct, community_sizes, assignments, labels, "
            "  compute_ms, expires_at"
            ") VALUES ("
            "  $1, 'u1', ARRAY[$2]::uuid[], '{}'::jsonb, 0, 0, 0, "
            "  ARRAY[]::int[], '{}'::jsonb, '{}'::jsonb, 0, "
            "  now() + interval '1 day'"
            ")",
            key, sync_id,
        )
    return key


async def _wait_for_absent(pool, key: str, timeout_s: float = 3.0) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        async with pool.acquire() as conn:
            present = await conn.fetchval(
                "SELECT 1 FROM leiden_cache WHERE cache_key = $1", key,
            )
        if not present:
            return True
        await asyncio.sleep(0.05)
    return False


async def test_sync_completed_event_invalidates_overlap(
    app_pool, running_listener,
):
    """Emit a sync_lifecycle {status:'completed'} event via the real SseBus
    into substrate_sse. The listener must invalidate any leiden_cache row
    whose sync_ids array overlaps this sync."""
    from substrate_common.sse import Event, SseBus
    from src.graph import store

    pool = store.get_pool()
    sync_id = uuid.uuid4()
    cache_key = await _insert_cache_row(pool, str(sync_id))

    bus = SseBus(pool)
    await bus.publish(Event(
        type="sync_lifecycle", sync_id=sync_id,
        payload={"status": "completed"},
    ))

    gone = await _wait_for_absent(pool, cache_key)
    assert gone, "cache row was not invalidated within 3s"


async def test_non_terminal_status_does_not_invalidate(
    app_pool, running_listener,
):
    """A sync_lifecycle event with status='running' must be ignored —
    running syncs don't flip the graph topology, only terminal transitions do."""
    from substrate_common.sse import Event, SseBus
    from src.graph import store

    pool = store.get_pool()
    sync_id = uuid.uuid4()
    cache_key = await _insert_cache_row(pool, str(sync_id))

    bus = SseBus(pool)
    await bus.publish(Event(
        type="sync_lifecycle", sync_id=sync_id,
        payload={"status": "running"},
    ))

    # Short window — we want to assert absence of action, not its eventual
    # occurrence, so wait just long enough for the listener to dispatch.
    await asyncio.sleep(0.4)
    async with pool.acquire() as conn:
        still = await conn.fetchval(
            "SELECT 1 FROM leiden_cache WHERE cache_key = $1", cache_key,
        )
    assert still == 1, "cache was invalidated by a non-terminal event"

    # Clean up manually — no invalidation happened.
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM leiden_cache WHERE cache_key = $1", cache_key,
        )


async def test_sweeper_removes_expired_on_startup(app_pool):
    """Insert a cache row already past its TTL, start the tasks, and
    verify the sweeper's immediate-first-iteration tick removes it
    without waiting for the interval."""
    from src.graph import store
    from src.startup import start_leiden_cache_tasks, stop_leiden_cache_tasks

    pool = store.get_pool()
    key = f"sweeper-{uuid.uuid4().hex[:10]}"
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO leiden_cache ("
            "  cache_key, user_sub, sync_ids, config, community_count, "
            "  modularity, orphan_pct, community_sizes, assignments, labels, "
            "  compute_ms, expires_at"
            ") VALUES ("
            "  $1, 'u1', ARRAY[]::uuid[], '{}'::jsonb, 0, 0, 0, "
            "  ARRAY[]::int[], '{}'::jsonb, '{}'::jsonb, 0, "
            "  now() - interval '1 hour'"
            ")",
            key,
        )

    await start_leiden_cache_tasks()
    try:
        gone = await _wait_for_absent(pool, key, timeout_s=3.0)
        assert gone, "sweeper did not remove expired row on startup"
    finally:
        await stop_leiden_cache_tasks()
