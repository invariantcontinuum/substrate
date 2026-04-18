"""
SSE event bus backed by Postgres LISTEN/NOTIFY + a durable `sse_events` table.

Producer (ingestion, graph) calls `SseBus.publish(Event(...))` which inserts into
`sse_events` and emits `pg_notify('substrate_sse', <id>)` in the same
transaction. Subscribers (gateway's /api/events SSE endpoint) call
`SseBus.subscribe(filters=..., since=last_event_id)`: it first replays gapped
rows from `sse_events`, then streams new events as they arrive.

Overflow handling: each subscriber has a bounded in-memory queue. On overflow
the subscriber is dropped via `StreamDropped` so the SSE response can close
gracefully; the browser's EventSource auto-reconnects and replays via
Last-Event-ID.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import uuid as _uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

import asyncpg
import structlog
from pydantic import BaseModel, Field
from ulid import ULID

_log = structlog.get_logger()


class StreamDropped(Exception):  # noqa: N818 — named for the event it signals, not an error suffix
    """Subscriber dropped because its bounded queue overflowed."""


class Event(BaseModel):
    id: str = Field(default_factory=lambda: str(ULID()))
    type: str
    sync_id: _uuid.UUID | None = None
    source_id: _uuid.UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    emitted_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC)
    )


class SseBus:
    """Postgres LISTEN/NOTIFY event bus backing SSE server-push."""

    CHANNEL = "substrate_sse"

    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @classmethod
    @asynccontextmanager
    async def connect(cls, dsn: str) -> AsyncIterator[SseBus]:
        pool = await asyncpg.create_pool(
            _plain_dsn(dsn), min_size=1, max_size=4
        )
        try:
            yield cls(pool)
        finally:
            await pool.close()

    async def publish(self, event: Event) -> Event:
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute(
                """
                    INSERT INTO sse_events
                        (id, type, sync_id, source_id, payload, emitted_at)
                    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
                    """,
                event.id,
                event.type,
                event.sync_id,
                event.source_id,
                json.dumps(event.payload),
                event.emitted_at,
            )
            await conn.execute(
                f"SELECT pg_notify('{self.CHANNEL}', $1)", event.id
            )
        _log.debug(
            "sse_event_published",
            event_id=event.id,
            type=event.type,
            sync_id=str(event.sync_id) if event.sync_id else None,
            source_id=str(event.source_id) if event.source_id else None,
        )
        return event

    async def subscribe(
        self,
        *,
        filters: dict[str, Any] | None = None,
        since: str | None = None,
        queue_max: int = 256,
    ) -> AsyncIterator[Event]:
        filters = filters or {}
        sync_id = filters.get("sync_id")
        source_id = filters.get("source_id")

        # Replay any rows from sse_events since last seen
        replay = await self._replay(since, sync_id, source_id)

        queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=queue_max)

        listen_conn = await self._pool.acquire()

        def on_notify(_c: Any, _pid: int, _chan: str, event_id: str) -> None:
            try:
                queue.put_nowait(event_id)
            except asyncio.QueueFull:
                # Signal overflow with a sentinel and stop buffering.
                with contextlib.suppress(asyncio.QueueFull):
                    queue.put_nowait(None)

        await listen_conn.add_listener(self.CHANNEL, on_notify)
        _log.info(
            "sse_subscriber_attached",
            sync_id=str(sync_id) if sync_id else None,
            source_id=str(source_id) if source_id else None,
        )

        try:
            for ev in replay:
                yield ev

            while True:
                event_id = await queue.get()
                if event_id is None:
                    _log.warning("sse_subscriber_dropped", reason="queue_overflow")
                    raise StreamDropped("subscriber queue overflow")
                fetched = await self._fetch(listen_conn, event_id)
                if fetched is None:
                    continue
                if sync_id is not None and fetched.sync_id != sync_id:
                    continue
                if source_id is not None and fetched.source_id != source_id:
                    continue
                yield fetched
        finally:
            try:
                await listen_conn.remove_listener(self.CHANNEL, on_notify)
            except Exception as e:  # noqa: BLE001
                _log.warning("sse_listener_remove_failed", error=str(e))
            await self._pool.release(listen_conn)

    async def _replay(
        self,
        since: str | None,
        sync_id: _uuid.UUID | None,
        source_id: _uuid.UUID | None,
    ) -> list[Event]:
        clauses: list[str] = []
        args: list[Any] = []
        if since:
            args.append(since)
            clauses.append(f"id > ${len(args)}")
        if sync_id is not None:
            args.append(sync_id)
            clauses.append(f"sync_id = ${len(args)}")
        if source_id is not None:
            args.append(source_id)
            clauses.append(f"source_id = ${len(args)}")

        query = "SELECT id, type, sync_id, source_id, payload, emitted_at FROM sse_events"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY id ASC"

        async with self._pool.acquire() as conn:
            rows = await conn.fetch(query, *args)
        return [_row_to_event(r) for r in rows]

    async def _fetch(self, conn: asyncpg.Connection, event_id: str) -> Event | None:
        row = await conn.fetchrow(
            "SELECT id, type, sync_id, source_id, payload, emitted_at "
            "FROM sse_events WHERE id = $1",
            event_id,
        )
        if not row:
            return None
        return _row_to_event(row)


def _row_to_event(row: asyncpg.Record) -> Event:
    payload = row["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return Event(
        id=row["id"],
        type=row["type"],
        sync_id=row["sync_id"],
        source_id=row["source_id"],
        payload=payload or {},
        emitted_at=row["emitted_at"],
    )


def _plain_dsn(dsn: str) -> str:
    """Strip the '+asyncpg' driver hint so asyncpg.create_pool accepts the URL."""
    return dsn.replace("postgresql+asyncpg://", "postgresql://")
