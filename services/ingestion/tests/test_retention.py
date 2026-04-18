"""Retention cron (B).

Policy: clean when (age > age_days) OR (rank > per_source_cap) AND NOT never_prune.
Row preserved as audit; graph data removed via clean_sync_impl.
Concurrency: pg_try_advisory_lock(RETENTION_LOCK_ID).
"""
import pytest
import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from src.scheduler import prune_retention_once
from src.config import settings


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_age_policy_cleans_old_rows(db_with_sync_runs):
    source_id = await db_with_sync_runs.add_source()
    old = await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(40))
    new = await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(10))
    with _override(retention_age_days=30, retention_per_source_cap=100):
        cleaned = await _run_tick_collect(db_with_sync_runs)
    assert old in cleaned
    assert new not in cleaned


async def test_count_policy_cleans_overflow(db_with_sync_runs):
    source_id = await db_with_sync_runs.add_source()
    ids = []
    for i in range(15):
        ids.append(await db_with_sync_runs.add_completed_sync(
            source_id, completed_at=_days_ago(15 - i)  # ids[0] = oldest
        ))
    with _override(retention_age_days=10000, retention_per_source_cap=10):
        cleaned = await _run_tick_collect(db_with_sync_runs)
    assert set(cleaned) == set(ids[:5])


async def test_or_semantics(db_with_sync_runs):
    source_id = await db_with_sync_runs.add_source()
    a = await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(40))   # age only
    b = await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(5))    # count-only
    _keep = await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(1))
    c = await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(45))   # both
    with _override(retention_age_days=30, retention_per_source_cap=1):
        cleaned = await _run_tick_collect(db_with_sync_runs)
    assert a in cleaned and b in cleaned and c in cleaned
    assert _keep not in cleaned


async def test_per_source_never_prune_excludes(db_with_sync_runs):
    source_id = await db_with_sync_runs.add_source(config={"retention": {"never_prune": True}})
    old = await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(999))
    with _override(retention_age_days=30, retention_per_source_cap=1):
        cleaned = await _run_tick_collect(db_with_sync_runs)
    assert old not in cleaned


async def test_per_source_age_days_override(db_with_sync_runs):
    source_id = await db_with_sync_runs.add_source(config={"retention": {"age_days": 60}})
    row = await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(40))
    with _override(retention_age_days=30, retention_per_source_cap=100):
        cleaned = await _run_tick_collect(db_with_sync_runs)
    assert row not in cleaned


async def test_disabled_is_noop(db_with_sync_runs):
    source_id = await db_with_sync_runs.add_source()
    await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(999))
    with _override(retention_enabled=False):
        cleaned = await _run_tick_collect(db_with_sync_runs)
    assert cleaned == []


async def test_advisory_lock_single_runner(db_with_sync_runs):
    source_id = await db_with_sync_runs.add_source()
    await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(999))

    async def tick_collect_isolated():
        """Each concurrent invocation gets its own accumulator list."""
        local_ids: list = []

        async def _spy(conn, sync_id):
            local_ids.append(sync_id)

        with patch("src.scheduler.clean_sync_impl", side_effect=_spy):
            await prune_retention_once()
        return local_ids

    with _override(retention_age_days=30, retention_per_source_cap=1):
        results = await asyncio.gather(tick_collect_isolated(), tick_collect_isolated())

    ran = [r for r in results if r]
    skipped = [r for r in results if not r]
    assert len(ran) == 1 and len(skipped) == 1


async def test_idempotent(db_with_sync_runs):
    source_id = await db_with_sync_runs.add_source()
    await db_with_sync_runs.add_completed_sync(source_id, completed_at=_days_ago(999))
    with _override(retention_age_days=30, retention_per_source_cap=1):
        # First tick uses the real clean_sync_impl so it actually marks rows 'cleaned'.
        # The spy is not needed here — we just run the real implementation.
        first_ids: list = []
        original_impl = __import__("src.sync_runs", fromlist=["clean_sync_impl"]).clean_sync_impl

        async def _real_spy(conn, sync_id):
            first_ids.append(sync_id)
            await original_impl(conn, sync_id)

        with patch("src.scheduler.clean_sync_impl", side_effect=_real_spy):
            await prune_retention_once()

        second = await _run_tick_collect(db_with_sync_runs)
    assert len(first_ids) == 1
    assert second == []


# helpers

def _days_ago(n: int) -> datetime:
    return datetime.now(tz=timezone.utc) - timedelta(days=n)


@contextmanager
def _override(**kwargs):
    old = {k: getattr(settings, k) for k in kwargs}
    for k, v in kwargs.items():
        setattr(settings, k, v)
    try:
        yield
    finally:
        for k, v in old.items():
            setattr(settings, k, v)


async def _run_tick_collect(fixture):
    fixture.cleaned_ids.clear()

    async def _spy(conn, sync_id):
        fixture.cleaned_ids.append(sync_id)

    with patch("src.scheduler.clean_sync_impl", side_effect=_spy):
        await prune_retention_once()
    return list(fixture.cleaned_ids)
