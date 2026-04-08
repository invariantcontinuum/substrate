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


import re as _re

class SyncSchedule(BaseModel):
    id: int = 0
    owner: str
    repo: str
    interval_minutes: int = 60
    enabled: bool = True
    last_run: datetime | None = None
    next_run: datetime | None = None

class ScheduleRequest(BaseModel):
    repo_url: str
    interval_minutes: int = 60
    enabled: bool = True

_GITHUB_HTTPS_RE = _re.compile(r"https?://github\.com/([^/]+)/([^/.]+?)(?:\.git)?/?$")
_GITHUB_SSH_RE = _re.compile(r"git@github\.com:([^/]+)/([^/.]+?)(?:\.git)?$")

def parse_repo_url(url: str) -> tuple[str, str]:
    for pattern in (_GITHUB_HTTPS_RE, _GITHUB_SSH_RE):
        m = pattern.match(url.strip())
        if m:
            return m.group(1), m.group(2)
    raise ValueError(f"Invalid GitHub URL: {url}")
