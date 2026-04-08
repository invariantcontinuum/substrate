import json
import structlog
from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

logger = structlog.get_logger()


class ConnectionManager:
    """Manages WebSocket connections and broadcasts deltas."""

    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        logger.info("ws_connected", total=len(self._connections))

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)
        logger.info("ws_disconnected", total=len(self._connections))

    async def broadcast(self, delta: dict) -> None:
        """Send delta to all connected clients."""
        message = json.dumps(delta)
        disconnected = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()
