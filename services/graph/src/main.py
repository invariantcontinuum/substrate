import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI

from src.graph import store
from src.api.routes import router
from src.config import settings
from src.startup import check_embedding_dim

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.connect()
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await check_embedding_dim(conn, expected_dim=settings.embedding_dim)
    logger.info("graph_service_started")
    yield
    await store.disconnect()
    logger.info("graph_service_stopped")


app = FastAPI(title="Substrate Graph Service", lifespan=lifespan)

app.include_router(router)

from src.api.sources import router as sources_router
app.include_router(sources_router)

from src.api.syncs import router as syncs_router
from src.api.schedules import router as schedules_router
app.include_router(syncs_router)
app.include_router(schedules_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
