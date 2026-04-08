import json
import asyncio
import structlog
from fastapi import WebSocket

logger = structlog.get_logger()


class ConnectionManager:
    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.add(websocket)
        logger.info("ws_connected", total=len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)
        logger.info("ws_disconnected", total=len(self._connections))

    async def broadcast(self, delta: dict) -> None:
        if not self._connections:
            return
        message = json.dumps(delta)
        connections = list(self._connections)
        results = await asyncio.gather(
            *[ws.send_text(message) for ws in connections],
            return_exceptions=True,
        )
        for ws, result in zip(connections, results):
            if isinstance(result, Exception):
                self._connections.discard(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()
