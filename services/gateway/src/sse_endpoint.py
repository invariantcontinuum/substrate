"""
SSE endpoint: streams substrate events to the browser via EventSource.

Subscription model:
  GET /api/events?sync_id=<uuid>&source_id=<uuid>
  Accept: text/event-stream
  [Last-Event-ID: <ulid>]   -- optional, auto-set by EventSource on reconnect

On open the server replays any rows from sse_events past the Last-Event-ID
that match the filters, then streams new events from Postgres LISTEN/NOTIFY.

Auth + token expiry:
  - JWT verified at connection open (same pipeline as /api/* routes).
  - An open SSE response cannot return an HTTP status mid-body. Instead
    the server schedules a timer at token_exp - 30s and, when it fires,
    emits `event: token_expired\\ndata:` then closes. The frontend client
    refreshes the token and reopens with a new bearer + Last-Event-ID.
  - On queue overflow the server emits `event: stream_dropped` and
    closes; EventSource auto-reconnects and replays the gap.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any, Optional

import asyncpg
import structlog
from fastapi import APIRouter, Header, Query, Request
from sse_starlette.sse import EventSourceResponse

from substrate_common import Event, SseBus, StreamDropped, UnauthorizedError
from substrate_common.db import asyncpg_dsn

from src.config import settings

_log = structlog.get_logger()

router = APIRouter()

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    """Called from gateway lifespan at startup."""
    global _pool
    _pool = await asyncpg.create_pool(
        asyncpg_dsn(settings.database_url),
        min_size=settings.sse_pool_min_size,
        max_size=settings.sse_pool_max_size,
    )
    _log.info(
        "sse_gateway_pool_ready",
        min_size=settings.sse_pool_min_size,
        max_size=settings.sse_pool_max_size,
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _bus() -> SseBus:
    if _pool is None:
        raise RuntimeError("SSE gateway pool not initialized")
    return SseBus(_pool)


async def _authenticate(request: Request, query_token: str | None) -> dict:
    """Same JWT verify as other /api/* routes — but EventSource can't set
    custom headers, so we also accept `?access_token=<jwt>` (OAuth2 standard
    fallback; RFC 6750 §2.3). The query-string path is used only for SSE.
    Raises UnauthorizedError on any failure.
    """
    if settings.auth_disabled:
        return {"sub": "dev", "exp": int(time.time()) + 3600}

    token: str | None = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    elif query_token:
        token = query_token

    if not token:
        raise UnauthorizedError("missing bearer token")

    from src.main import jwt_verifier  # late import to avoid cycle

    if jwt_verifier is None:
        raise UnauthorizedError("verifier not initialised")
    return await jwt_verifier.verify(token)


def _token_seconds_remaining(claims: dict[str, Any]) -> int:
    exp = int(claims.get("exp", 0))
    if exp <= 0:
        return 3600  # no exp → tolerate a full hour before forced reconnect
    return max(0, exp - int(time.time()))


def _extract_sub(claims: dict[str, Any]) -> str:
    for key in ("sub", "preferred_username", "email"):
        value = claims.get(key)
        if isinstance(value, str) and value:
            return value
    raise UnauthorizedError("token missing sub/preferred_username/email")


@router.get("/api/events")
async def events(
    request: Request,
    sync_id: Optional[uuid.UUID] = Query(default=None),
    source_id: Optional[uuid.UUID] = Query(default=None),
    access_token: Optional[str] = Query(default=None),
    last_event_id: Optional[str] = Header(default=None, alias="Last-Event-ID"),
) -> EventSourceResponse:
    claims = await _authenticate(request, access_token)
    ttl = max(5, _token_seconds_remaining(claims) - 30)
    user_sub = _extract_sub(claims)

    filters: dict[str, Any] = {"user_sub": user_sub}
    if sync_id is not None:
        filters["sync_id"] = sync_id
    if source_id is not None:
        filters["source_id"] = source_id

    async def stream() -> AsyncIterator[dict[str, Any]]:
        bus = _bus()
        expiry_task = asyncio.create_task(asyncio.sleep(ttl))
        try:
            gen = bus.subscribe(filters=filters, since=last_event_id)
            while True:
                next_task = asyncio.create_task(_next(gen))
                done, _pending = await asyncio.wait(
                    {next_task, expiry_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if expiry_task in done and not next_task.done():
                    next_task.cancel()
                    _log.info("sse_token_expired", ttl=ttl)
                    yield {"event": "token_expired", "data": ""}
                    return
                try:
                    ev: Event = next_task.result()
                except StreamDropped:
                    _log.warning("sse_stream_dropped")
                    yield {"event": "stream_dropped", "data": ""}
                    return
                except StopAsyncIteration:
                    return
                yield {
                    "id": ev.id,
                    "event": ev.type,
                    "data": ev.model_dump_json(),
                }
        finally:
            if not expiry_task.done():
                expiry_task.cancel()

    return EventSourceResponse(stream(), ping=15)


async def _next(gen: AsyncIterator[Event]) -> Event:
    """Pull the next event out of an async generator or raise StopAsyncIteration."""
    return await gen.__anext__()
