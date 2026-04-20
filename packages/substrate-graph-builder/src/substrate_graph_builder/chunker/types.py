"""Chunk dataclass shared by every chunker strategy."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Chunk:
    content: str
    start_line: int              # 1-based, inclusive
    end_line: int                # 1-based, inclusive
    token_count: int
    chunk_index: int = 0         # populated by dispatch after collection
    chunk_type: str = "block"    # function / method / class / heading / paragraph / line / block
    symbols: list[str] = field(default_factory=list)
    language: str = ""
