import asyncio
import httpx
import structlog
from fastapi import Request, WebSocket, Response

logger = structlog.get_logger()


async def proxy_request(request: Request, target_url: str) -> Response:
    """Forward an HTTP request to a backend service."""
    url = f"{target_url}{request.url.path}"
    if request.url.query:
        url += f"?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=await request.body(),
        )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=dict(resp.headers),
    )


async def proxy_websocket(
    websocket: WebSocket,
    target_url: str,
    path: str,
    token: str | None = None,
) -> None:
    """Proxy a WebSocket connection to a backend service."""
    await websocket.accept()
    ws_url = f"{target_url.replace('http', 'ws')}{path}"
    if token:
        ws_url += f"?token={token}"

    import websockets

    try:
        async with websockets.connect(ws_url) as upstream:
            async def client_to_upstream():
                async for msg in websocket.iter_text():
                    await upstream.send(msg)

            async def upstream_to_client():
                async for msg in upstream:
                    await websocket.send_text(msg)

            await asyncio.gather(client_to_upstream(), upstream_to_client())
    except Exception:
        logger.exception("websocket_proxy_error")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
