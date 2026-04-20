"""Canonical error hierarchy + FastAPI handler registration.

Every HTTP error body returned by any substrate service matches the
ErrorResponse envelope defined in DSG-015 §5.2:

    { "error": {"code", "message", "details"}, "request_id": "..." }
"""
from __future__ import annotations

from typing import Any

import structlog
import ulid
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

log = structlog.get_logger()


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = {}


class ErrorResponse(BaseModel):
    """Canonical HTTP error body — must stay in lockstep with the zod
    `ErrorResponse` in `packages/substrate-web-common/src/errors.ts`. Checked
    by `make check-contracts`.
    """

    error: ErrorDetail
    request_id: str


class SubstrateError(Exception):
    code: str = "INTERNAL"
    status: int = 500

    def __init__(self, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationError(SubstrateError):
    code, status = "VALIDATION", 400


class UnauthorizedError(SubstrateError):
    code, status = "UNAUTHORIZED", 401


class ForbiddenError(SubstrateError):
    code, status = "FORBIDDEN", 403


class NotFoundError(SubstrateError):
    code, status = "NOT_FOUND", 404


class ConflictError(SubstrateError):
    code, status = "CONFLICT", 409


class UpstreamError(SubstrateError):
    code, status = "UPSTREAM", 502


class InternalError(SubstrateError):
    code, status = "INTERNAL", 500


def _request_id(request: Request) -> str:
    rid = getattr(request.state, "request_id", None)
    return rid if rid else str(ulid.ULID())


def _envelope(code: str, message: str, details: dict[str, Any], request_id: str) -> dict:
    return {
        "error": {"code": code, "message": message, "details": details},
        "request_id": request_id,
    }


def _known_error_log_method(status: int) -> str:
    return "error" if status >= 500 else "info"


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(SubstrateError)
    async def handle_known(request: Request, exc: SubstrateError):
        getattr(log, _known_error_log_method(exc.status))(
            "error_returned",
            error_code=exc.code,
            error_status=exc.status,
            message=exc.message,
            details=exc.details,
        )
        return JSONResponse(
            status_code=exc.status,
            content=_envelope(exc.code, exc.message, exc.details, _request_id(request)),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request: Request, exc: StarletteHTTPException):
        code = "VALIDATION" if exc.status_code == 422 else "HTTP"
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(code, str(exc.detail), {}, _request_id(request)),
        )

    @app.exception_handler(Exception)
    async def handle_unknown(request: Request, exc: Exception):
        log.exception("unhandled_error", error=str(exc))
        return JSONResponse(
            status_code=500,
            content=_envelope("INTERNAL", "Internal error", {}, _request_id(request)),
        )
