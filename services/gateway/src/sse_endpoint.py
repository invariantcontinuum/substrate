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
from typing import Any, AsyncIterator, Optional

import asyncpg
import structlog
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sse_starlette.sse import EventSourceResponse
from substrate_common.sse import Event, SseBus, StreamDropped

from src.auth import validate_token
from src.config import settings

_log = structlog.get_logger()

router = APIRouter()

_pool: asyncpg.Pool | None = None


def _plain_dsn(dsn: str) -> str:
    return dsn.replace("postgresql+asyncpg://", "postgresql://")


async def init_pool() -> None:
    """Called from gateway lifespan at startup."""
    global _pool
    _pool = await asyncpg.create_pool(
        _plain_dsn(settings.database_url), min_size=1, max_size=4
    )
    _log.info("sse_gateway_pool_ready")


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _bus() -> SseBus:
    if _pool is None:
        raise RuntimeError("SSE gateway pool not initialized")
    return SseBus(_pool)


async def _authenticate(request: Request) -> dict:
    """Same JWT verify as other /api/* routes. Raises 401 on failure."""
    if settings.auth_disabled:
        return {"sub": "dev", "exp": int(time.time()) + 3600}
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = auth[7:]
    try:
        import jwt as pyjwt

        from src.main import jwks_client  # late import to avoid cycle

        unverified = pyjwt.get_unverified_header(token)
        kid = unverified.get("kid")
        if not kid or not jwks_client:
            raise HTTPException(status_code=401, detail="token unverifiable")
        public_key = await jwks_client.get_key(kid)
        return validate_token(token, public_key, issuer=settings.issuer)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        _log.warning("sse_auth_failed", error=str(e))
        raise HTTPException(status_code=401, detail="invalid token") from e


def _token_seconds_remaining(claims: dict[str, Any]) -> int:
    exp = int(claims.get("exp", 0))
    if exp <= 0:
        return 3600  # no exp → tolerate a full hour before forced reconnect
    return max(0, exp - int(time.time()))


@router.get("/api/events")
async def events(
    request: Request,
    sync_id: Optional[uuid.UUID] = Query(default=None),
    source_id: Optional[uuid.UUID] = Query(default=None),
    last_event_id: Optional[str] = Header(default=None, alias="Last-Event-ID"),
) -> EventSourceResponse:
    claims = await _authenticate(request)
    ttl = max(5, _token_seconds_remaining(claims) - 30)

    filters: dict[str, Any] = {}
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

    # Keepalive every 15s; browsers disconnect idle SSE after ~30-60s.
    return EventSourceResponse(stream(), ping=15)


async def _next(gen: AsyncIterator[Event]) -> Event:
    """Pull the next event out of an async generator or raise StopAsyncIteration."""
    return await gen.__anext__()
