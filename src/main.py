import asyncio
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel

from src.config import settings
from src.db import get_pool, close_pool
from src.publisher import connect as nats_connect, disconnect as nats_disconnect, publish
from src.connectors.github import sync_repo, close_client
from src.schema import GraphEvent, ScheduleRequest, parse_repo_url
from src.scheduler import (
    get_schedules, upsert_schedule, delete_schedule,
    toggle_schedule, start_scheduler, stop_scheduler,
)

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()

_sync_tasks: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await nats_connect(settings.nats_url)

    async def run_sync(owner: str, repo: str):
        event = await sync_repo(owner, repo, settings.github_token)
        pool = await get_pool()
        await pool.execute(
            "INSERT INTO raw_events (source, event_type, payload) VALUES ($1, $2, $3)",
            "github", "sync", event.model_dump_json(),
        )
        await publish(event)

    await start_scheduler(run_sync)
    logger.info("ingestion_started")
    yield
    await stop_scheduler()
    for task in _sync_tasks.values():
        if not task.done():
            task.cancel()
    await close_client()
    await nats_disconnect()
    await close_pool()
    logger.info("ingestion_stopped")


app = FastAPI(title="Substrate Ingestion", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    running = [k for k, t in _sync_tasks.items() if not t.done()]
    return {"status": "ok", "syncs_running": running}


class SyncRequest(BaseModel):
    owner: str = ""
    repo: str = ""
    repo_url: str = ""


@app.post("/ingest/github/sync")
async def trigger_sync(req: SyncRequest):
    owner, repo = req.owner, req.repo
    if req.repo_url:
        owner, repo = parse_repo_url(req.repo_url)
    if not owner or not repo:
        return {"error": "Provide owner+repo or repo_url"}, 400

    sync_key = f"{owner}/{repo}"
    if sync_key in _sync_tasks and not _sync_tasks[sync_key].done():
        return {"status": "sync_already_running", "owner": owner, "repo": repo}

    async def _run():
        try:
            event = await sync_repo(owner, repo, settings.github_token)
            pool = await get_pool()
            await pool.execute(
                "INSERT INTO raw_events (source, event_type, payload) VALUES ($1, $2, $3)",
                "github", "sync", event.model_dump_json(),
            )
            await publish(event)
            logger.info("sync_published", owner=owner, repo=repo)
        except Exception:
            logger.exception("sync_failed")

    _sync_tasks[sync_key] = asyncio.create_task(_run())
    return {"status": "sync_started", "owner": owner, "repo": repo}


@app.get("/ingest/schedules")
async def list_schedules():
    schedules = await get_schedules()
    return [s.model_dump() for s in schedules]


@app.post("/ingest/schedules")
async def create_schedule(req: ScheduleRequest):
    owner, repo = parse_repo_url(req.repo_url)
    schedule = await upsert_schedule(owner, repo, req.interval_minutes, req.enabled)
    return schedule.model_dump()


@app.delete("/ingest/schedules/{schedule_id}")
async def remove_schedule(schedule_id: int):
    await delete_schedule(schedule_id)
    return {"status": "deleted"}


@app.post("/ingest/schedules/{schedule_id}/toggle")
async def toggle_sched(schedule_id: int):
    schedule = await toggle_schedule(schedule_id)
    if not schedule:
        return {"error": "not found"}, 404
    return schedule.model_dump()
