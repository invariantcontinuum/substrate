"""Ingestion-side chunker shim.

All chunking logic now lives in substrate_graph_builder.chunker — this
module only adapts the interface to ingestion's existing callers and
keeps the ingestion-local `file_summary_text` helper.
"""
from __future__ import annotations

import structlog

from src.config import settings
from substrate_graph_builder.chunker import Chunk, chunk_content, estimate_tokens

logger = structlog.get_logger()

__all__ = ["Chunk", "chunk_file", "estimate_tokens", "file_summary_text"]


def chunk_file(
    path: str,
    content: str,
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[Chunk]:
    budget = chunk_size if chunk_size is not None else settings.chunk_size
    over = overlap if overlap is not None else settings.chunk_overlap
    chunks = chunk_content(path=path, content=content, budget=budget, overlap=over)
    logger.debug("file_chunked", path=path, chunks_produced=len(chunks),
                 input_bytes=len(content))
    return chunks


def file_summary_text(
    file_path: str,
    file_type: str,
    language: str,
    content: str,
    max_lines: int | None = None,
) -> str:
    lines = max_lines if max_lines is not None else settings.file_summary_preview_lines
    preview = "\n".join(content.split("\n")[:lines])
    return f"path: {file_path}\ntype: {file_type}\nlanguage: {language}\n\n{preview}"
