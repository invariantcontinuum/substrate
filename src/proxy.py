import httpx
import structlog
from fastapi import Request, Response, WebSocket
from starlette.responses import StreamingResponse

logger = structlog.get_logger()

_client: httpx.AsyncClient | None = None


async def init_client() -> None:
    global _client
    _client = httpx.AsyncClient(
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0),
        follow_redirects=False,
    )
    logger.info("proxy_client_initialized")


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None
        logger.info("proxy_client_closed")


async def proxy_request(request: Request, upstream_base: str) -> Response:
    if not _client:
        raise RuntimeError("Proxy client not initialized")

    url = f"{upstream_base}{request.url.path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)
    body = await request.body()

    resp = await _client.request(
        method=request.method,
        url=url,
        headers=headers,
        content=body,
    )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=dict(resp.headers),
    )


async def proxy_websocket(
    websocket: WebSocket, upstream_base: str, path: str, token: str
) -> None:
    import websockets

    ws_base = upstream_base.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_base}{path}?token={token}"

    await websocket.accept()

    try:
        async with websockets.connect(ws_url) as upstream:
            import asyncio

            async def client_to_upstream():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await upstream.send(data)
                except Exception:
                    pass

            async def upstream_to_client():
                try:
                    async for message in upstream:
                        await websocket.send_text(str(message))
                except Exception:
                    pass

            await asyncio.gather(client_to_upstream(), upstream_to_client())
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
