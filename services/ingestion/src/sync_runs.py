"""Lifecycle helpers for sync_runs rows. Single source of truth for status transitions."""
import json
import asyncpg
from src import graph_writer, events


async def clean_sync_impl(conn: asyncpg.Connection, sync_id: str) -> None:
    """Idempotent graph-data removal for a completed/failed/cancelled/cleaned sync_run.

    Accepts a pre-acquired connection so callers (route handler, retention cron)
    can share a transaction boundary. Does NOT delete the sync_runs row — the row
    is preserved as an audit trail with status='cleaned'.

    No-op if the row is already in 'cleaned' state or if it doesn't exist.
    Raises HTTP 409 (via the route layer) when the caller is a request handler;
    when called from the retention cron the status guard is embedded in the
    candidate query and this function is only called on terminal rows.
    """
    status = await conn.fetchval("SELECT status FROM sync_runs WHERE id=$1::uuid", sync_id)
    if status is None or status == "cleaned":
        return
    if status not in ("completed", "failed", "cancelled"):
        # Non-terminal — skip silently when called from cron; route handler wraps
        # this in an explicit status check and raises 409 before calling us.
        return
    await graph_writer.cleanup_partial(sync_id)
    # Conditional update so a concurrent purge or another clean is a no-op.
    await conn.execute(
        "UPDATE sync_runs SET status='cleaned' WHERE id=$1::uuid AND status=$2",
        sync_id, status,
    )


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


async def _get_source_id(conn: asyncpg.Connection, sync_id: str) -> str | None:
    return await conn.fetchval(
        "SELECT source_id::text FROM sync_runs WHERE id=$1::uuid", sync_id
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
        source_id = await _get_source_id(conn, sync_id)
    claimed = result == "UPDATE 1"
    if claimed:
        await events.publish_sync_lifecycle(sync_id, "running", source_id=source_id)
    return claimed


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
        source_id = await _get_source_id(conn, sync_id)
    await events.publish_sync_progress(sync_id, done, total, meta, source_id=source_id)


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
        source_id = await _get_source_id(conn, sync_id)
    await events.publish_sync_lifecycle(sync_id, "completed", source_id=source_id)


async def fail_sync_run(sync_id: str, message: str) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sync_runs SET status='failed', completed_at=now() WHERE id=$1::uuid",
            sync_id,
        )
        source_id = await _get_source_id(conn, sync_id)
    # Persist the failure reason as a structured issue so the UI can show it.
    from src import sync_issues
    await sync_issues.record_issue(
        sync_id, "error", "terminal", "sync_failed", message, {})
    await events.publish_sync_lifecycle(sync_id, "failed", source_id=source_id)


async def cancel_sync_run(sync_id: str, message: str) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sync_runs SET status='cancelled', completed_at=now() WHERE id=$1::uuid",
            sync_id,
        )
        source_id = await _get_source_id(conn, sync_id)
    from src import sync_issues
    await sync_issues.record_issue(
        sync_id, "info", "terminal", "sync_cancelled", message, {})
    await events.publish_sync_lifecycle(sync_id, "cancelled", source_id=source_id)


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
    conn: asyncpg.Connection,
    *,
    source_id: str,
    config_snapshot: dict,
    triggered_by: str,
    schedule_id: int | None = None,
) -> tuple[str, bool]:
    """Atomic create-or-return-existing active sync for a source.

    Returns (sync_id, created). created=True → a new sync_runs row was inserted;
    created=False → an active sync already existed and sync_id is that existing id.
    """
    row = await conn.fetchrow(
        """
        INSERT INTO sync_runs (source_id, config_snapshot, triggered_by, status, schedule_id)
        VALUES ($1::uuid, $2::jsonb, $3, 'pending', $4)
        ON CONFLICT (source_id) WHERE status IN ('pending', 'running') DO NOTHING
        RETURNING id::text
        """,
        source_id, json.dumps(config_snapshot), triggered_by, schedule_id,
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
        INSERT INTO sync_runs (source_id, config_snapshot, triggered_by, status, schedule_id)
        VALUES ($1::uuid, $2::jsonb, $3, 'pending', $4)
        ON CONFLICT (source_id) WHERE status IN ('pending', 'running') DO NOTHING
        RETURNING id::text
        """,
        source_id, json.dumps(config_snapshot), triggered_by, schedule_id,
    )
    if row is not None:
        return row["id"], True
    raise RuntimeError(
        "ensure_active_sync: ON CONFLICT fired twice but no active row present"
    )
