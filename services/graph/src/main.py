from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

from substrate_common import (
    ExceptionLoggingMiddleware,
    RequestIdMiddleware,
    configure_logging,
    init_bus,
    register_handlers,
)

from src.api.activity import router as activity_router
from src.api.chat import router as chat_router
from src.api.chat_context import (
    thread_router as chat_context_thread_router,
    user_router as chat_context_user_router,
)
from src.api.chat_edit import router as chat_edit_router
from src.api.communities import router as communities_router
from src.api.deletion import router as deletion_router
from src.api.export import router as export_router
from src.api.files import router as files_router
from src.api.graph_search import router as graph_search_router
from src.api.integrations import router as integrations_router
from src.api.internal_config import router as internal_config_router
from src.api.preferences import router as preferences_router
from src.api.routes import router
from src.api.schedules import router as schedules_router
from src.api.sessions import router as sessions_router
from src.api.sources import router as sources_router
from src.api.syncs import router as syncs_router
from src.api.usage import router as usage_router
from src.api.users import router as users_router
from src.config import settings
from src.graph import store
from src.sse_retention import start_sse_retention_loop, stop_sse_retention_loop
from src.startup import (
    check_embedding_dim,
    init_config_overlay,
    start_leiden_cache_tasks,
    stop_leiden_cache_tasks,
)

configure_logging(service=settings.service_name)
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.connect()
    pool = store.get_pool()
    init_bus(pool)
    # Load runtime overlay BEFORE any settings-coupled startup checks
    # (embedding_dim guard, retention loop, Leiden tasks) so an operator-
    # tuned value already takes effect on the first request after restart.
    await init_config_overlay(pool)
    async with pool.acquire() as conn:
        await check_embedding_dim(conn, expected_dim=settings.embedding_dim)
    await start_sse_retention_loop()
    await start_leiden_cache_tasks()
    logger.info("graph_service_started")
    yield
    await stop_leiden_cache_tasks()
    await stop_sse_retention_loop()
    await store.disconnect()
    logger.info("graph_service_stopped")


app = FastAPI(title="Substrate Graph Service", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(ExceptionLoggingMiddleware)
register_handlers(app)

app.include_router(router)
app.include_router(sources_router)
app.include_router(syncs_router)
app.include_router(schedules_router)
app.include_router(activity_router)
app.include_router(chat_router)
app.include_router(chat_edit_router)
app.include_router(communities_router)
app.include_router(preferences_router)
app.include_router(users_router)
app.include_router(sessions_router)
app.include_router(integrations_router)
app.include_router(usage_router)
app.include_router(deletion_router)
app.include_router(files_router)
app.include_router(graph_search_router)
app.include_router(chat_context_user_router)
app.include_router(chat_context_thread_router)
app.include_router(export_router)
app.include_router(internal_config_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
