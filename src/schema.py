from pydantic import BaseModel, Field
from datetime import datetime, timezone
from uuid import uuid4


class NodeAffected(BaseModel):
    id: str
    name: str
    type: str  # service | database | cache | external
    action: str  # add | update | remove
    domain: str = ""
    meta: dict = Field(default_factory=dict)


class EdgeAffected(BaseModel):
    source_id: str
    target_id: str
    type: str  # depends
    action: str  # add | remove
    label: str = ""


class GraphEvent(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    source: str  # github | k8s | terraform
    event_type: str  # push | pr_open | pr_merge | sync
    nodes_affected: list[NodeAffected] = Field(default_factory=list)
    edges_affected: list[EdgeAffected] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
