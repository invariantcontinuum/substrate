"""Per-sync issue recorder with hard cap to prevent table blowup on chatty failures."""
import json
from src import graph_writer

ISSUE_CAP = 1000


def _pool():
    if graph_writer._pool is None:
        raise RuntimeError("graph_writer not connected")
    return graph_writer._pool


async def record_issue(sync_id: str, level: str, phase: str, code: str | None,
                        message: str, context: dict | None = None) -> None:
    pool = _pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT count(*) FROM sync_issues WHERE sync_id=$1::uuid", sync_id
        )
        if existing >= ISSUE_CAP:
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
            return
        await conn.execute(
            """INSERT INTO sync_issues (sync_id, level, phase, code, message, context)
               VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)""",
            sync_id, level, phase, code, message, json.dumps(context or {}),
        )
