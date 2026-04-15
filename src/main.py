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

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()


async def _reap_zombies() -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        zombies = await conn.fetch(
            "SELECT id::text FROM sync_runs WHERE status IN ('running','pending')"
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
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        src_row = await conn.fetchrow("SELECT config FROM sources WHERE id=$1::uuid", req.source_id)
    if not src_row:
        raise HTTPException(404, "source not found")
    base = src_row["config"] if isinstance(src_row["config"], dict) else {}
    snapshot = {**base, **req.config_overrides}
    try:
        sid = await sync_runs.create_sync_run(req.source_id, snapshot, "user")
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "source already has an active sync")
    return {"id": sid, "status": "pending"}


@app.post("/api/syncs/{sync_id}/cancel")
async def cancel_sync(sync_id: str):
    status = await sync_runs.check_sync_status(sync_id)
    if status not in ("pending", "running"):
        raise HTTPException(409, f"sync is in terminal state: {status}")
    await sync_runs.cancel_sync_run(sync_id, "user requested")
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
    await graph_writer.cleanup_partial(sync_id)
    async with graph_writer.get_pool().acquire() as conn:
        await conn.execute("UPDATE sync_runs SET status='cleaned' WHERE id=$1::uuid", sync_id)
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
