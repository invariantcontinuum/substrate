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


@app.get("/health")
async def health():
    return {"status": "ok"}
