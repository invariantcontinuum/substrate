"""Pydantic model + canonical hashing for active-set Leiden (spec §2.4)."""
import hashlib
import json
from uuid import UUID

from pydantic import BaseModel, Field


class LeidenConfig(BaseModel):
    """Active-set Leiden knobs. Range validation matches the spec defaults'
    safe operating envelope; wider ranges would require a graspologic
    benchmark before being exposed."""
    resolution: float = Field(ge=0.1, le=10.0)
    beta: float       = Field(ge=0.0, le=0.1)
    iterations: int   = Field(ge=1, le=50)
    min_cluster_size: int = Field(ge=1, le=1000)
    seed: int = 42

    def canonical_hash(self, sync_ids: list[UUID]) -> str:
        """sha256 over (sorted sync_ids + canonical config JSON).
        Identical logical inputs must produce identical hashes across
        Python restarts and dict-ordering variations. This is the single
        source of truth for leiden_cache.cache_key (spec §2.4)."""
        sorted_ids = "|".join(sorted(str(s) for s in sync_ids))
        canonical = json.dumps(self.model_dump(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(f"{sorted_ids}::{canonical}".encode()).hexdigest()
