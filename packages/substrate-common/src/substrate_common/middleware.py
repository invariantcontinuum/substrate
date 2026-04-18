"""Shared FastAPI middleware: request id + exception logging.

Both services mount these in the same order at startup (inside create-app
factories or `lifespan`). The request id propagates to every log line via
`structlog.contextvars` and surfaces in the uniform error envelope returned
by `substrate_common.errors.register_handlers`.
"""
from __future__ import annotations

import traceback

import structlog
import ulid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

log = structlog.get_logger()


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or str(ulid.ULID())
        request.state.request_id = rid
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=rid)
        try:
            response: Response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()
        response.headers["x-request-id"] = rid
        return response


class ExceptionLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as e:  # noqa: BLE001 — log every unhandled error then re-raise
            log.error(
                "unhandled_exception",
                error=str(e),
                traceback=traceback.format_exc(),
                path=str(request.url.path),
                method=request.method,
            )
            raise
