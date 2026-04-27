"""Per-sync issue recorder with hard cap to prevent table blowup on chatty failures."""
from src import graph_writer
from src.config import settings


async def record_issue(sync_id: str, level: str, phase: str, code: str | None,
                        message: str, context: dict | None = None) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        # Atomic: insert iff under cap, returning whether the insert happened.
        inserted = await conn.fetchval(
            """WITH cap_check AS (
                   SELECT count(*) AS n FROM sync_issues WHERE sync_id=$1::uuid
               )
               INSERT INTO sync_issues (sync_id, level, phase, code, message, context)
               SELECT $1::uuid, $2, $3, $4, $5, $6::jsonb
                 FROM cap_check WHERE n < $7
               RETURNING 1""",
            sync_id, level, phase, code, message, context or {},
            settings.sync_issue_cap,
        )
        if inserted is not None:
            return
        # Cap reached — bump suppressed counter + ensure marker exists.
        await conn.execute(
            """UPDATE sync_runs
               SET stats = jsonb_set(coalesce(stats, '{}'::jsonb), '{issues_suppressed}',
                   to_jsonb(coalesce((stats->>'issues_suppressed')::int, 0) + 1))
               WHERE id = $1::uuid""",
            sync_id,
        )
        await conn.execute(
            """INSERT INTO sync_issues (sync_id, level, phase, code, message)
               SELECT $1::uuid, 'warning', $2, 'truncation_marker',
                      'Issue cap reached; further issues suppressed and counted in stats.issues_suppressed'
               WHERE NOT EXISTS (
                   SELECT 1 FROM sync_issues WHERE sync_id=$1::uuid AND code='truncation_marker'
               )""",
            sync_id, phase,
        )
