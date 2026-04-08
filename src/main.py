import asyncio
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel

from src.config import settings
from src.db import get_pool, close_pool
from src.publisher import connect as nats_connect, disconnect as nats_disconnect, publish
from src.connectors.github import sync_repo
from src.schema import GraphEvent

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()

_sync_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await nats_connect(settings.nats_url)
    logger.info("ingestion_started")
    yield
    global _sync_task
    if _sync_task and not _sync_task.done():
        _sync_task.cancel()
    await nats_disconnect()
    await close_pool()
    logger.info("ingestion_stopped")


app = FastAPI(title="Substrate Ingestion", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    return {
        "status": "ok",
        "sync_running": _sync_task is not None and not _sync_task.done(),
    }


class SyncRequest(BaseModel):
    owner: str
    repo: str


@app.post("/ingest/github/sync")
async def trigger_sync(req: SyncRequest):
    """Trigger a full GitHub repo sync."""
    global _sync_task

    async def _run_sync():
        try:
            event = await sync_repo(req.owner, req.repo, settings.github_token)
            pool = await get_pool()
            await pool.execute(
                "INSERT INTO raw_events (source, event_type, payload) VALUES ($1, $2, $3)",
                "github",
                "sync",
                event.model_dump_json(),
            )
            await pool.execute(
                """INSERT INTO graph_events (source, event_type, nodes_affected, edges_affected)
                   VALUES ($1, $2, $3, $4)""",
                event.source,
                event.event_type,
                event.model_dump_json(),
                event.model_dump_json(),
            )
            await publish(event)
            logger.info("sync_published", owner=req.owner, repo=req.repo)
        except Exception:
            logger.exception("sync_failed")

    _sync_task = asyncio.create_task(_run_sync())
    return {"status": "sync_started", "owner": req.owner, "repo": req.repo}
