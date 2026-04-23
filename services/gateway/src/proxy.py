import asyncio
import httpx
import structlog
from fastapi import Request, Response
from fastapi.responses import JSONResponse

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
    transport = httpx.AsyncHTTPTransport(retries=2)
    _client = httpx.AsyncClient(
        transport=transport,
        limits=httpx.Limits(
            max_connections=100,
            max_keepalive_connections=20,
            keepalive_expiry=2.0,
        ),
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
# or that Starlette/uvicorn will re-emit on the outgoing response.
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


async def proxy_request(
    request: Request,
    upstream_base: str,
    extra_headers: dict[str, str] | None = None,
) -> Response:
    if not _client:
        raise RuntimeError("Proxy client not initialized")

    url = f"{upstream_base}{request.url.path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)
    if extra_headers:
        headers.update(extra_headers)
    body = await request.body()

    is_idempotent = request.method.upper() in _IDEMPOTENT_METHODS
    attempts = 3 if is_idempotent else 1

    # Summary endpoints and Ask turn endpoints both call the local dense
    # LLM, which routinely takes 30-90s; grant them a 115s read timeout
    # instead of the default 60s.
    path = request.url.path
    is_long_llm_call = (
        path.endswith("/summary")
        or (path.startswith("/api/ask/threads/") and path.endswith("/messages"))
    )
    per_request_timeout = (
        httpx.Timeout(connect=5.0, read=115.0, write=10.0, pool=10.0)
        if is_long_llm_call
        else None
    )

    last_exc: Exception | None = None
    resp = None
    for attempt in range(attempts):
        try:
            if per_request_timeout is not None:
                resp = await _client.request(
                    method=request.method,
                    url=url,
                    headers=headers,
                    content=body,
                    timeout=per_request_timeout,
                )
            else:
                resp = await _client.request(
                    method=request.method,
                    url=url,
                    headers=headers,
                    content=body,
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
