# services/ingestion/src/main.py
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
import asyncpg

from src.config import settings
from src.db import close_pool
from src import graph_writer, sync_runs, sync_issues, sync_schedules
from src.connectors.github import close_client as close_github_client
from src.llm import close_client as close_llm_client
from src.schema import SyncRequest, ScheduleRequest, ScheduleUpdateRequest
from src.jobs.runner import start_runner, stop_runner
from src.scheduler import start_scheduler, stop_scheduler

import logging as _logging
import os as _os
_LOG_LEVEL = getattr(_logging, _os.environ.get("LOG_LEVEL", "INFO").upper(), _logging.INFO)
structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(_LOG_LEVEL),
)
logger = structlog.get_logger()


async def _reap_zombies() -> None:
    """Reap rows in 'running' status — they were mid-sync when the service died.
    'pending' rows are left alone; the runner will pick them up on next poll.
    """
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        zombies = await conn.fetch(
            "SELECT id::text FROM sync_runs WHERE status = 'running'"
        )
    for row in zombies:
        sid = row["id"]
        await graph_writer.cleanup_partial(sid)
        await sync_issues.record_issue(
            sid, "error", "startup", "service_restart",
            "Service restarted while sync was active", {})
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE sync_runs SET status='failed', completed_at=now() WHERE id=$1::uuid",
                sid,
            )
    if zombies:
        logger.warning("zombie_syncs_reaped", count=len(zombies))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await graph_writer.connect(settings.graph_database_url)
    await _reap_zombies()
    await start_runner()
    await start_scheduler()
    logger.info("ingestion_started")
    yield
    await stop_scheduler()
    await stop_runner()
    await close_github_client()
    await close_llm_client()
    await graph_writer.disconnect()
    await close_pool()
    logger.info("ingestion_stopped")


app = FastAPI(title="Substrate Ingestion", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Sources CRUD lives entirely in the graph service. Ingestion does NOT
# expose POST /api/sources — the gateway routes /api/sources/* to graph.


# --- Syncs (write side) ---

@app.post("/api/syncs")
async def create_sync(req: SyncRequest):
    from src.connectors.github import CONNECTORS
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        src_row = await conn.fetchrow(
            "SELECT source_type, config FROM sources WHERE id=$1::uuid", req.source_id)
    if not src_row:
        raise HTTPException(404, "source not found")
    if src_row["source_type"] not in CONNECTORS:
        raise HTTPException(
            400, f"no connector registered for source_type={src_row['source_type']}")
    base = src_row["config"] if isinstance(src_row["config"], dict) else {}
    snapshot = {**base, **req.config_overrides}
    try:
        sid = await sync_runs.create_sync_run(req.source_id, snapshot, "user")
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "source already has an active sync")
    return {"id": sid, "status": "pending"}


@app.post("/api/syncs/{sync_id}/cancel")
async def cancel_sync(sync_id: str):
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """UPDATE sync_runs SET status='cancelled', completed_at=now()
               WHERE id=$1::uuid AND status IN ('pending','running')""",
            sync_id,
        )
    if result != "UPDATE 1":
        # Either the row doesn't exist OR it already terminated
        async with pool.acquire() as conn:
            status = await conn.fetchval("SELECT status FROM sync_runs WHERE id=$1::uuid", sync_id)
        if status is None:
            raise HTTPException(404, "sync_run not found")
        raise HTTPException(409, f"sync is in terminal state: {status}")
    # Record the cancel reason as an issue (mirrors what cancel_sync_run did before)
    await sync_issues.record_issue(
        sync_id, "info", "terminal", "sync_cancelled", "user requested", {})
    return {"status": "cancelled"}


@app.post("/api/syncs/{sync_id}/retry")
async def retry_sync(sync_id: str):
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT source_id::text, config_snapshot FROM sync_runs WHERE id=$1::uuid", sync_id
        )
    if not row:
        raise HTTPException(404, "sync_run not found")
    snapshot = row["config_snapshot"] if isinstance(row["config_snapshot"], dict) else {}
    try:
        new_id = await sync_runs.create_sync_run(
            row["source_id"], snapshot, f"retry:{sync_id}")
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "source already has an active sync")
    return {"id": new_id, "status": "pending"}


@app.post("/api/syncs/{sync_id}/clean")
async def clean_sync(sync_id: str):
    pool = graph_writer.get_pool()
    # Atomic: clean only if the row is in a terminal state. Mid-flight syncs
    # cannot be cleaned (cancel them first, then clean).
    async with pool.acquire() as conn:
        status = await conn.fetchval("SELECT status FROM sync_runs WHERE id=$1::uuid", sync_id)
    if status is None:
        raise HTTPException(404, "sync_run not found")
    if status not in ("completed", "failed", "cancelled"):
        raise HTTPException(409, f"sync must be in terminal state to clean (got: {status})")
    await graph_writer.cleanup_partial(sync_id)
    async with pool.acquire() as conn:
        # Conditional update so a concurrent purge or another clean is a no-op.
        await conn.execute(
            "UPDATE sync_runs SET status='cleaned' WHERE id=$1::uuid AND status=$2",
            sync_id, status,
        )
    return {"status": "cleaned"}


@app.delete("/api/syncs/{sync_id}")
async def purge_sync(sync_id: str):
    """Full purge: drop graph data + remove the sync_runs row."""
    await graph_writer.cleanup_partial(sync_id)
    async with graph_writer.get_pool().acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE id=$1::uuid", sync_id)
    return {"status": "deleted"}


# --- Schedules ---

@app.post("/api/schedules")
async def create_schedule(req: ScheduleRequest):
    return await sync_schedules.create_schedule(
        req.source_id, req.interval_minutes, req.config_overrides)


@app.patch("/api/schedules/{schedule_id}")
async def patch_schedule(schedule_id: int, req: ScheduleUpdateRequest):
    out = await sync_schedules.update_schedule(
        schedule_id, req.interval_minutes, req.enabled, req.config_overrides)
    if not out:
        raise HTTPException(404, "schedule not found")
    return out


@app.delete("/api/schedules/{schedule_id}")
async def remove_schedule(schedule_id: int):
    await sync_schedules.delete_schedule(schedule_id)
    return {"status": "deleted"}
