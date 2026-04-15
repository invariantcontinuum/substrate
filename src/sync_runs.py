"""Lifecycle helpers for sync_runs rows. Single source of truth for status transitions."""
import json
from src import graph_writer



async def create_sync_run(source_id: str, config_snapshot: dict,
                          triggered_by: str, schedule_id: int | None = None) -> str:
    """Insert pending row. Raises asyncpg.UniqueViolationError if source has active sync."""
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """INSERT INTO sync_runs (source_id, status, config_snapshot, triggered_by, schedule_id)
               VALUES ($1::uuid, 'pending', $2::jsonb, $3, $4)
               RETURNING id::text""",
            source_id, json.dumps(config_snapshot), triggered_by, schedule_id,
        )


async def claim_sync_run(sync_id: str) -> bool:
    """Atomically transition pending → running. Returns False if already claimed/cancelled."""
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE sync_runs SET status = 'running', started_at = now()
               WHERE id = $1::uuid AND status = 'pending'""",
            sync_id,
        )
    return result == "UPDATE 1"


async def update_sync_progress(sync_id: str, done: int, total: int,
                               meta: dict | None = None) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        if meta is not None:
            await conn.execute(
                "UPDATE sync_runs SET progress_done=$2, progress_total=$3, progress_meta=$4::jsonb WHERE id=$1::uuid",
                sync_id, done, total, json.dumps(meta),
            )
        else:
            await conn.execute(
                "UPDATE sync_runs SET progress_done=$2, progress_total=$3 WHERE id=$1::uuid",
                sync_id, done, total,
            )


async def set_ref(sync_id: str, ref: str) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE sync_runs SET ref=$2 WHERE id=$1::uuid", sync_id, ref)


async def complete_sync_run(sync_id: str, stats: dict) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE sync_runs SET status='completed', completed_at=now(), stats=$2::jsonb
               WHERE id=$1::uuid""",
            sync_id, json.dumps(stats),
        )


async def fail_sync_run(sync_id: str, message: str) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sync_runs SET status='failed', completed_at=now() WHERE id=$1::uuid",
            sync_id,
        )
    # Persist the failure reason as a structured issue so the UI can show it.
    from src import sync_issues
    await sync_issues.record_issue(
        sync_id, "error", "terminal", "sync_failed", message, {})


async def cancel_sync_run(sync_id: str, message: str) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sync_runs SET status='cancelled', completed_at=now() WHERE id=$1::uuid",
            sync_id,
        )
    from src import sync_issues
    await sync_issues.record_issue(
        sync_id, "info", "terminal", "sync_cancelled", message, {})


async def check_sync_status(sync_id: str) -> str | None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval("SELECT status FROM sync_runs WHERE id=$1::uuid", sync_id)


async def update_source_last_sync(source_id: str, sync_id: str) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE sources SET last_sync_id=$2::uuid, last_synced_at=now(), updated_at=now()
               WHERE id=$1::uuid""",
            source_id, sync_id,
        )


async def ensure_active_sync(
    conn,
    *,
    source_id: str,
    config_snapshot: dict,
    triggered_by: str,
) -> tuple[str, bool]:
    """Atomic create-or-return-existing active sync for a source.

    Returns (sync_id, created). created=True → a new sync_runs row was inserted;
    created=False → an active sync already existed and sync_id is that existing id.
    """
    row = await conn.fetchrow(
        """
        INSERT INTO sync_runs (source_id, config_snapshot, triggered_by, status)
        VALUES ($1::uuid, $2::jsonb, $3, 'pending')
        ON CONFLICT ON CONSTRAINT ux_sync_runs_one_active_per_source DO NOTHING
        RETURNING id::text
        """,
        source_id, json.dumps(config_snapshot), triggered_by,
    )
    if row is not None:
        return row["id"], True

    existing = await conn.fetchval(
        """
        SELECT id::text FROM sync_runs
        WHERE source_id = $1::uuid AND status IN ('pending', 'running')
        LIMIT 1
        """,
        source_id,
    )
    if existing is not None:
        return existing, False

    # Rare: another writer terminated the active sync between our conflict and
    # the SELECT. Try exactly one more insert; if that also conflicts without
    # an existing row, raise so the caller sees a real error instead of looping.
    row = await conn.fetchrow(
        """
        INSERT INTO sync_runs (source_id, config_snapshot, triggered_by, status)
        VALUES ($1::uuid, $2::jsonb, $3, 'pending')
        ON CONFLICT ON CONSTRAINT ux_sync_runs_one_active_per_source DO NOTHING
        RETURNING id::text
        """,
        source_id, json.dumps(config_snapshot), triggered_by,
    )
    if row is not None:
        return row["id"], True
    raise RuntimeError(
        "ensure_active_sync: ON CONFLICT fired twice but no active row present"
    )
