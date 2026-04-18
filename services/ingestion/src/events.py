"""
Thin wrapper around substrate-common's SSE bus, bound to ingestion's
existing asyncpg pool via graph_writer.

Producers in this service call publish_* helpers after DB writes.
SSE publish failures are logged and swallowed — the side channel must
never break a sync.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

import structlog
from substrate_common.sse import Event, SseBus

from src import graph_writer

_log = structlog.get_logger()
_bus: SseBus | None = None


def init_bus() -> None:
    """Bind SSE bus to the already-connected graph_writer pool."""
    global _bus
    pool = graph_writer.get_pool()
    _bus = SseBus(pool)
    _log.info("sse_bus_initialized")


def bus() -> SseBus:
    if _bus is None:
        raise RuntimeError("SSE bus not initialized — call init_bus() at startup")
    return _bus


async def _safe_publish(event: Event) -> None:
    try:
        await bus().publish(event)
    except Exception as e:  # noqa: BLE001 — SSE side channel must not break producers
        _log.warning(
            "sse_publish_failed", event_type=event.type, error=str(e)
        )


async def publish_sync_lifecycle(
    sync_id: str | uuid.UUID,
    status: str,
    ref: Optional[str] = None,
    triggered_by: Optional[str] = None,
) -> None:
    await _safe_publish(
        Event(
            type="sync_lifecycle",
            sync_id=uuid.UUID(str(sync_id)),
            payload={"status": status, "ref": ref, "triggered_by": triggered_by},
        )
    )


async def publish_sync_progress(
    sync_id: str | uuid.UUID,
    progress_done: int,
    progress_total: int,
    progress_meta: Optional[dict[str, Any]] = None,
) -> None:
    await _safe_publish(
        Event(
            type="sync_progress",
            sync_id=uuid.UUID(str(sync_id)),
            payload={
                "progress_done": progress_done,
                "progress_total": progress_total,
                "progress_meta": progress_meta or {},
            },
        )
    )


async def publish_source_changed(
    source_id: str | uuid.UUID,
    reason: str,
    diff: Optional[dict[str, Any]] = None,
) -> None:
    await _safe_publish(
        Event(
            type="source_changed",
            source_id=uuid.UUID(str(source_id)),
            payload={"reason": reason, "diff": diff or {}},
        )
    )


async def publish_snapshot_loaded(
    sync_id: str | uuid.UUID,
    node_count: int,
    edge_count: int,
) -> None:
    await _safe_publish(
        Event(
            type="snapshot_loaded",
            sync_id=uuid.UUID(str(sync_id)),
            payload={"node_count": node_count, "edge_count": edge_count},
        )
    )
