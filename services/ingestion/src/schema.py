import re as _re
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from uuid import uuid4


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
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FileMetadata(BaseModel):
    description: str = ""
    category: str = "source"
    language: str = ""
    exports: list[str] = Field(default_factory=list)


class SourceRequest(BaseModel):
    source_type: str = "github_repo"
    owner: str
    name: str
    url: str
    config: dict = Field(default_factory=dict)


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


_GITHUB_HTTPS_RE = _re.compile(r"https?://github\.com/([^/]+)/([^/.]+?)(?:\.git)?/?$")
_GITHUB_SSH_RE = _re.compile(r"git@github\.com:([^/]+)/([^/.]+?)(?:\.git)?$")


def parse_repo_url(url: str) -> tuple[str, str]:
    for pattern in (_GITHUB_HTTPS_RE, _GITHUB_SSH_RE):
        m = pattern.match(url.strip())
        if m:
            return m.group(1), m.group(2)
    raise ValueError(f"Invalid GitHub URL: {url}")
