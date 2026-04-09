import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI

from src.config import settings
from src.db import get_pool, close_pool
from src.publisher import connect as nats_connect, disconnect as nats_disconnect
from src.connectors.github import close_client as close_github_client
from src.llm import close_client as close_llm_client
from src.qdrant import close_client as close_qdrant_client
from src.schema import JobRequest, ScheduleRequest, parse_repo_url
from src.jobs.runner import register_handler, run_job, get_job_runs, get_job_run
from src.jobs.sync import handle_sync
from src.jobs.enrich import handle_enrich
from src.scheduler import get_schedules, upsert_schedule, delete_schedule, toggle_schedule, start_scheduler, stop_scheduler

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await nats_connect(settings.nats_url)

    register_handler("sync", handle_sync)
    register_handler("enrich", handle_enrich)

    await start_scheduler(run_job)
    logger.info("ingestion_started")
    yield
    await stop_scheduler()
    await close_github_client()
    await close_llm_client()
    await close_qdrant_client()
    await nats_disconnect()
    await close_pool()
    logger.info("ingestion_stopped")


app = FastAPI(title="Substrate Ingestion", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/jobs")
async def create_job(req: JobRequest):
    job_id = await run_job(req.job_type, req.scope)
    return {"job_id": job_id, "job_type": req.job_type, "status": "started"}


@app.get("/jobs")
async def list_jobs():
    runs = await get_job_runs()
    return runs


@app.get("/jobs/schedules")
async def list_schedules_endpoint():
    schedules = await get_schedules()
    return [s.model_dump() for s in schedules]


@app.post("/jobs/schedules")
async def create_schedule(req: ScheduleRequest):
    owner, repo = "", ""
    if req.repo_url:
        owner, repo = parse_repo_url(req.repo_url)
    schedule = await upsert_schedule(req.job_type, owner, repo, req.interval_minutes, req.scope)
    return schedule.model_dump()


@app.delete("/jobs/schedules/{schedule_id}")
async def remove_schedule(schedule_id: int):
    await delete_schedule(schedule_id)
    return {"status": "deleted"}


@app.post("/jobs/schedules/{schedule_id}/toggle")
async def toggle_sched(schedule_id: int):
    schedule = await toggle_schedule(schedule_id)
    if not schedule:
        return {"error": "not found"}, 404
    return schedule.model_dump()


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    run = await get_job_run(job_id)
    if not run:
        return {"error": "not found"}, 404
    return run
