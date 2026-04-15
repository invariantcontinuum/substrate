"""Sync-run helpers for the graph service read side.

ensure_active_sync is intentionally duplicated here (Option B) rather than
imported from ingestion or extracted to a shared package, because the two
services are independently deployable microservices with different pool
references, and the function is small enough that keeping a local copy is
the safest, smallest diff.
"""
import json
import asyncpg
from src.graph import store


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
