"""Graph event schema — shared between ingestion (producer) and
substrate-graph-builder (pure emission of the same types).

Relocated from services/ingestion/src/schema.py in SP-2 (DSG-016) so both
sides of the library boundary import from one place.
"""
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, Field


class NodeAffected(BaseModel):
    id: str
    name: str
    type: str
    action: str
    domain: str = ""
    meta: dict = Field(default_factory=dict)


class EdgeAffected(BaseModel):
    source_id: str
    target_id: str
    type: str
    action: str
    label: str = ""


class GraphEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    source: str
    event_type: str
    nodes_affected: list[NodeAffected] = Field(default_factory=list)
    edges_affected: list[EdgeAffected] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SyncRequest(BaseModel):
    source_id: str
    config_overrides: dict = Field(default_factory=dict)


class ScheduleRequest(BaseModel):
    source_id: str
    interval_minutes: int
    config_overrides: dict = Field(default_factory=dict)


class ScheduleUpdateRequest(BaseModel):
    interval_minutes: int | None = None
    enabled: bool | None = None
    config_overrides: dict | None = None



