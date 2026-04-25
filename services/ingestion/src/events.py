"""
Typed publish_* helpers around the shared substrate_common SSE bus.

The bus singleton + safe_publish semantics live in `substrate_common.sse`.
This module just provides ingestion-specific event payload shapes.
Producers call `init_bus(graph_writer.get_pool())` at startup, then use
the helpers below; the helpers swallow publish errors so a producer
write path never breaks because the side channel hiccupped.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from substrate_common.sse import Event, init_bus as _init_shared_bus, safe_publish

from src import graph_writer


def init_bus() -> None:
    """Bind the shared SSE bus to ingestion's graph_writer pool."""
    _init_shared_bus(graph_writer.get_pool())


async def publish_sync_lifecycle(
    sync_id: str | uuid.UUID,
    status: str,
    ref: Optional[str] = None,
    triggered_by: Optional[str] = None,
    source_id: str | uuid.UUID | None = None,
    user_sub: str | None = None,
) -> None:
    event = Event(
        type="sync_lifecycle",
        sync_id=uuid.UUID(str(sync_id)),
        user_sub=user_sub,
        payload={"status": status, "ref": ref, "triggered_by": triggered_by},
    )
    if source_id is not None:
        event.source_id = uuid.UUID(str(source_id))
    await safe_publish(event)


async def publish_sync_progress(
    sync_id: str | uuid.UUID,
    progress_done: int,
    progress_total: int,
    progress_meta: Optional[dict[str, Any]] = None,
    source_id: str | uuid.UUID | None = None,
    user_sub: str | None = None,
) -> None:
    event = Event(
        type="sync_progress",
        sync_id=uuid.UUID(str(sync_id)),
        user_sub=user_sub,
        payload={
            "progress_done": progress_done,
            "progress_total": progress_total,
            "progress_meta": progress_meta or {},
        },
    )
    if source_id is not None:
        event.source_id = uuid.UUID(str(source_id))
    await safe_publish(event)
