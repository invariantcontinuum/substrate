import asyncio
from datetime import datetime, timezone
from uuid import uuid4
import structlog
from src.db import get_pool

logger = structlog.get_logger()

_handlers: dict[str, object] = {}


def register_handler(job_type: str, handler) -> None:
    _handlers[job_type] = handler
    logger.info("job_handler_registered", job_type=job_type)


async def create_job_run(job_type: str, scope: dict) -> str:
    pool = await get_pool()
    job_id = str(uuid4())
    await pool.execute(
        """INSERT INTO job_runs (id, job_type, scope, status, created_at)
           VALUES ($1, $2, $3, 'pending', now())""",
        job_id, job_type, str(scope),
    )
    return job_id


async def run_job(job_type: str, scope: dict) -> str:
    handler = _handlers.get(job_type)
    if not handler:
        raise ValueError(f"Unknown job type: {job_type}")

    job_id = await create_job_run(job_type, scope)
    pool = await get_pool()

    async def _execute():
        try:
            await pool.execute(
                "UPDATE job_runs SET status = 'running', started_at = now() WHERE id = $1",
                job_id,
            )

            async def on_progress(done: int, total: int):
                await pool.execute(
                    "UPDATE job_runs SET progress_done = $1, progress_total = $2 WHERE id = $3",
                    done, total, job_id,
                )

            await handler(scope, on_progress)

            await pool.execute(
                "UPDATE job_runs SET status = 'completed', completed_at = now() WHERE id = $1",
                job_id,
            )
            logger.info("job_completed", job_id=job_id, job_type=job_type)
        except Exception as e:
            await pool.execute(
                "UPDATE job_runs SET status = 'failed', error = $1, completed_at = now() WHERE id = $2",
                str(e), job_id,
            )
            logger.error("job_failed", job_id=job_id, error=str(e))

    asyncio.create_task(_execute())
    return job_id


async def get_job_runs(limit: int = 20) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM job_runs ORDER BY created_at DESC LIMIT $1", limit
    )
    return [dict(r) for r in rows]


async def get_job_run(job_id: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM job_runs WHERE id = $1", job_id)
    return dict(row) if row else None
