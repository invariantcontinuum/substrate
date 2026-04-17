import asyncio
import httpx
import structlog
import websockets
from fastapi import Request, Response, WebSocket
from fastapi.responses import JSONResponse
from fastapi.websockets import WebSocketDisconnect
from starlette.responses import StreamingResponse
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError

logger = structlog.get_logger()

_client: httpx.AsyncClient | None = None

# httpx's transport `retries=N` only covers connection establishment, not
# mid-read disconnects. We need app-level retries on RemoteProtocolError
# for the keepalive race (uvicorn idle-closes at 5s). Idempotent verbs
# only — we never retry non-idempotent requests automatically.
_IDEMPOTENT_METHODS = {"GET", "HEAD", "OPTIONS", "PUT", "DELETE"}
_RETRYABLE = (httpx.RemoteProtocolError, httpx.ReadError, httpx.WriteError)


async def init_client() -> None:
    global _client
    # `keepalive_expiry=2.0`: prune pooled connections after 2s of idle,
    # well before uvicorn's default 5s idle close, so we don't reuse
    # about-to-be-closed sockets.
    # `retries=2` on the transport covers dropped *connects*; the
    # app-level retry in proxy_request below covers dropped *reads*.
    transport = httpx.AsyncHTTPTransport(retries=2)
    _client = httpx.AsyncClient(
        transport=transport,
        limits=httpx.Limits(
            max_connections=100,
            max_keepalive_connections=20,
            keepalive_expiry=2.0,
        ),
        # Read defaults to 60s for bulk polling endpoints. The per-route
        # override block below bumps LLM-backed summary endpoints to
        # 200s so slow Qwen3.5-4B generations don't 504 mid-response.
        # Connect is tight so dead hosts fail fast and retry logic
        # kicks in quickly.
        timeout=httpx.Timeout(connect=5.0, read=60.0, write=10.0, pool=10.0),
        follow_redirects=False,
    )
    logger.info("proxy_client_initialized")


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None
        logger.info("proxy_client_closed")


# Headers that either describe the hop (so MUST NOT be forwarded per RFC 7230)
# or that Starlette/uvicorn will re-emit on the outgoing response. Forwarding
# them causes the downstream (nginx) to see duplicate `Date` / `Server` /
# `Content-Length` headers and log warnings.
_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}
_SERVER_SET = {"date", "server", "content-length", "content-encoding"}
_STRIP_FROM_UPSTREAM = _HOP_BY_HOP | _SERVER_SET


async def proxy_request(request: Request, upstream_base: str) -> Response:
    if not _client:
        raise RuntimeError("Proxy client not initialized")

    url = f"{upstream_base}{request.url.path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)
    body = await request.body()

    # App-level retry for the keepalive-race: when the upstream idle-
    # closes a pooled connection right as we reuse it, the first read
    # fails with RemoteProtocolError. Only retry idempotent methods so we
    # don't double-submit a POST. `force=true` on GET /summary is a
    # regenerate trigger — treat it like a POST (single attempt) so a
    # transient retry doesn't double-invoke the LLM.
    is_idempotent = request.method.upper() in _IDEMPOTENT_METHODS
    is_force_regen = "force=true" in (request.url.query or "")
    attempts = 1 if is_force_regen or not is_idempotent else 3

    # Summary endpoints run local dense LLM calls that routinely take
    # 30-90s; override the default 60s read timeout for them. Kept a
    # touch above the graph-service LLM read-timeout (90s) so a
    # failing LLM surfaces as ``llm_failed`` upstream rather than as a
    # gateway-level timeout.
    is_summary = request.url.path.endswith("/summary")
    per_request_timeout = (
        httpx.Timeout(connect=5.0, read=115.0, write=10.0, pool=10.0)
        if is_summary
        else None
    )

    last_exc: Exception | None = None
    resp = None
    for attempt in range(attempts):
        try:
            resp = await _client.request(
                method=request.method,
                url=url,
                headers=headers,
                content=body,
                **({"timeout": per_request_timeout} if per_request_timeout else {}),
            )
            break
        except _RETRYABLE as e:
            last_exc = e
            if attempt < attempts - 1:
                await asyncio.sleep(0.1 * (2 ** attempt))
                continue
        except httpx.ConnectError as e:
            logger.warning(
                "proxy_upstream_unreachable",
                upstream=upstream_base,
                method=request.method,
                path=request.url.path,
                error=str(e),
            )
            return JSONResponse({"error": "upstream_unreachable"}, status_code=503)
        except httpx.TimeoutException as e:
            logger.warning(
                "proxy_upstream_timeout",
                upstream=upstream_base,
                method=request.method,
                path=request.url.path,
                error=str(e),
            )
            return JSONResponse({"error": "upstream_timeout"}, status_code=504)

    if resp is None:
        logger.warning(
            "proxy_upstream_disconnect",
            upstream=upstream_base,
            method=request.method,
            path=request.url.path,
            error=str(last_exc),
            attempts=attempts,
        )
        return JSONResponse({"error": "upstream_disconnected"}, status_code=502)
    forwarded_headers = {
        k: v for k, v in resp.headers.items() if k.lower() not in _STRIP_FROM_UPSTREAM
    }

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=forwarded_headers,
    )


async def proxy_websocket(
    websocket: WebSocket, upstream_base: str, path: str, token: str
) -> None:
    ws_base = upstream_base.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_base}{path}?token={token}"

    await websocket.accept()

    try:
        async with websockets.connect(ws_url) as upstream:

            async def client_to_upstream():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await upstream.send(data)
                except (WebSocketDisconnect, ConnectionClosedOK):
                    logger.info("ws_relay_client_closed",
                                direction="client_to_upstream")
                except ConnectionClosedError as e:
                    logger.warning("ws_relay_upstream_closed_error",
                                   direction="client_to_upstream", error=str(e))
                except Exception as e:
                    logger.warning("ws_relay_unexpected",
                                   direction="client_to_upstream", error=str(e))

            async def upstream_to_client():
                try:
                    async for message in upstream:
                        await websocket.send_text(str(message))
                except (WebSocketDisconnect, ConnectionClosedOK):
                    logger.info("ws_relay_client_closed",
                                direction="upstream_to_client")
                except ConnectionClosedError as e:
                    logger.warning("ws_relay_upstream_closed_error",
                                   direction="upstream_to_client", error=str(e))
                except Exception as e:
                    logger.warning("ws_relay_unexpected",
                                   direction="upstream_to_client", error=str(e))

            await asyncio.gather(client_to_upstream(), upstream_to_client())
    except (WebSocketDisconnect, ConnectionClosedOK):
        logger.info("ws_relay_client_closed", direction="outer")
    except ConnectionClosedError as e:
        logger.warning("ws_relay_upstream_closed_error",
                       direction="outer", error=str(e))
    except Exception as e:
        logger.warning("ws_relay_unexpected",
                       direction="outer", error=str(e))
    finally:
        try:
            await websocket.close()
        except Exception as e:
            logger.warning("ws_relay_close_failed", error=str(e))
