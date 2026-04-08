import asyncio
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket

from src.config import settings
from src.graph import store
from src.graph.store import init_redis, close_redis
from src.graph.websocket import manager
from src.events import consumer
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
    await store.connect(settings.neo4j_url, settings.neo4j_user, settings.neo4j_password)
    await init_redis(settings.redis_url)
    await consumer.connect(settings.nats_url, on_delta=manager.broadcast)
    await consumer.start_consuming()
    logger.info("graph_service_started")
    yield
    await consumer.disconnect()
    await close_redis()
    await store.disconnect()
    logger.info("graph_service_stopped")


app = FastAPI(title="Substrate Graph Service", lifespan=lifespan)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/graph")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        snapshot = await store.get_full_snapshot()
        await websocket.send_json({
            "type": "snapshot",
            "nodes": store.nodes_to_cytoscape(snapshot.nodes),
            "edges": store.edges_to_cytoscape(snapshot.edges),
            "meta": snapshot.meta,
        })
        while True:
            await websocket.receive_text()
    except Exception:
        manager.disconnect(websocket)
