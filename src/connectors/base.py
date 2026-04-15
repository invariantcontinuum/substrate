from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class MaterializedTree:
    """Filesystem snapshot of a source's contents at a point in time."""
    root_dir: str
    file_paths: list[str]                # relative to root_dir
    ref: str = ""                        # commit SHA / version identifier
    meta: dict = field(default_factory=dict)


class SourceConnector(Protocol):
    async def materialize(self, source: dict, scratch_dir: str) -> MaterializedTree:
        """Clone/download/extract the source into scratch_dir; return tree."""
        ...
