import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI

from src.graph import store
from src.api.routes import router

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.connect()
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
