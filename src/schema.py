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


class JobSchedule(BaseModel):
    id: int = 0
    job_type: str = "sync"
    owner: str = ""
    repo: str = ""
    interval_minutes: int = 60
    enabled: bool = True
    scope: dict = Field(default_factory=dict)
    last_run: datetime | None = None
    next_run: datetime | None = None


class JobRun(BaseModel):
    id: str = ""
    job_type: str
    scope: dict = Field(default_factory=dict)
    status: str = "pending"
    progress_done: int = 0
    progress_total: int = 0
    error: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class JobRequest(BaseModel):
    job_type: str
    scope: dict = Field(default_factory=dict)


class ScheduleRequest(BaseModel):
    job_type: str = "sync"
    repo_url: str = ""
    interval_minutes: int = 60
    scope: dict = Field(default_factory=dict)


_GITHUB_HTTPS_RE = _re.compile(r"https?://github\.com/([^/]+)/([^/.]+?)(?:\.git)?/?$")
_GITHUB_SSH_RE = _re.compile(r"git@github\.com:([^/]+)/([^/.]+?)(?:\.git)?$")


def parse_repo_url(url: str) -> tuple[str, str]:
    for pattern in (_GITHUB_HTTPS_RE, _GITHUB_SSH_RE):
        m = pattern.match(url.strip())
        if m:
            return m.group(1), m.group(2)
    raise ValueError(f"Invalid GitHub URL: {url}")
