# services/ingestion/src/main.py
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from src.config import settings
from src import graph_writer, sync_runs, sync_issues, sync_schedules, events
from src.sync_runs import clean_sync_impl
from src.connectors.github import close_client as close_github_client
from src.llm import close_client as close_llm_client
from src.schema import SyncRequest, ScheduleRequest, ScheduleUpdateRequest
from src.jobs.runner import start_runner, stop_runner
from src.scheduler import start_scheduler, stop_scheduler, start_retention_loop, stop_retention_loop
from src.sources_patch import SourcePatch, update_source_impl

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
    await graph_writer.connect(settings.database_url)
    events.init_bus()
    await _reap_zombies()
    await start_runner()
    await start_scheduler()
    await start_retention_loop()
    logger.info("ingestion_started")
    yield
    await stop_retention_loop()
    await stop_scheduler()
    await stop_runner()
    await close_github_client()
    await close_llm_client()
    await graph_writer.disconnect()
    logger.info("ingestion_stopped")


app = FastAPI(title="Substrate Ingestion", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


# Sources CRUD lives primarily in the graph service. Ingestion owns the
# partial-update (PATCH) endpoint so it can apply retention config changes
# that are tightly coupled to ingestion policy.


@app.patch("/api/sources/{source_id}")
async def update_source(source_id: str, patch: SourcePatch):
    pool = graph_writer.get_pool()
    return await update_source_impl(pool, source_id, patch)


# --- Syncs (write side) ---

@app.post("/api/syncs", status_code=202)
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
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        sync_id, created = await sync_runs.ensure_active_sync(
            conn,
            source_id=req.source_id,
            config_snapshot=snapshot,
            triggered_by="user",
        )
    if created:
        return {"sync_id": sync_id, "status": "pending"}
    logger.info(
        "api_sync_already_active",
        source_id=req.source_id,
        existing_sync_id=sync_id,
    )
    return JSONResponse(
        status_code=409,
        content={
            "error": "sync_already_active",
            "message": "A sync is already running or pending for this source.",
            "sync_id": sync_id,
            "status": "already_active",
        },
    )


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


@app.post("/api/syncs/{sync_id}/retry", status_code=202)
async def retry_sync(sync_id: str):
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT source_id::text, config_snapshot FROM sync_runs WHERE id=$1::uuid", sync_id
        )
    if not row:
        raise HTTPException(404, "sync_run not found")
    snapshot = row["config_snapshot"] if isinstance(row["config_snapshot"], dict) else {}
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        new_id, created = await sync_runs.ensure_active_sync(
            conn,
            source_id=row["source_id"],
            config_snapshot=snapshot,
            triggered_by=f"retry:{sync_id}",
        )
    if created:
        return {"sync_id": new_id, "status": "pending"}
    logger.info(
        "api_sync_already_active",
        source_id=row["source_id"],
        existing_sync_id=new_id,
    )
    return JSONResponse(
        status_code=409,
        content={
            "error": "sync_already_active",
            "message": "A sync is already running or pending for this source.",
            "sync_id": new_id,
            "status": "already_active",
        },
    )


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
    async with pool.acquire() as conn:
        await clean_sync_impl(conn, sync_id)
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
