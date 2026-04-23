"""Backfill stats on historical sync_runs. Spec §4.6.

Usage (runs inside the ingestion service's uv venv):
    uv run python -m scripts.backfill_stats [--only-missing] [--source-id UUID] [--since 2026-01-01]

Iterates completed sync_runs matching the filters, calls finalize_stats + per_sync_leiden
sequentially. Idempotent: --only-missing skips rows whose stats.schema_version == 1.
"""
import argparse
import asyncio
import os
import sys

import structlog

from src import graph_writer
from src.jobs.finalize_stats import finalize_stats
from src.jobs.per_sync_leiden import per_sync_leiden

logger = structlog.get_logger()


def _graph_dsn() -> str:
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql://substrate_graph:change-me@localhost:5432/substrate_graph",
    )
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-missing", action="store_true",
                    help="skip rows with stats.schema_version = 1")
    ap.add_argument("--source-id", help="limit to a single source UUID")
    ap.add_argument("--since", help="ISO date; only rows completed on/after")
    args = ap.parse_args()

    await graph_writer.connect(_graph_dsn())
    pool = graph_writer.get_pool()

    where = ["status = 'completed'"]
    params: list = []
    if args.source_id:
        where.append(f"source_id = ${len(params)+1}::uuid")
        params.append(args.source_id)
    if args.since:
        where.append(f"completed_at >= ${len(params)+1}::timestamptz")
        params.append(args.since)
    if args.only_missing:
        where.append("coalesce((stats->>'schema_version')::int, 0) < 1")

    sql = (
        "SELECT id::text FROM sync_runs "
        f"WHERE {' AND '.join(where)} ORDER BY completed_at"
    )
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)

    total = len(rows)
    logger.info("backfill_start", total=total,
                filters={"source_id": args.source_id, "since": args.since,
                         "only_missing": args.only_missing})
    for i, r in enumerate(rows, 1):
        sid = r["id"]
        try:
            await finalize_stats(sid)
            await per_sync_leiden(sid)
            logger.info("backfill_row_done", sync_id=sid, i=i, total=total)
        except Exception as e:  # noqa: BLE001 — per-row resilience; continue backfill
            logger.error("backfill_row_failed", sync_id=sid, error=str(e))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
