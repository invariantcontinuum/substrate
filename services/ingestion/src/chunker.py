"""Ingestion-side chunker shim.

All chunking logic now lives in substrate_graph_builder.chunker — this
module only adapts the interface to ingestion's existing callers and
keeps the ingestion-local `file_summary_text` helper.
"""
from __future__ import annotations

from typing import Literal, overload

import structlog

from src.config import settings
from substrate_graph_builder.chunker import Chunk, chunk_content, estimate_tokens
from substrate_graph_builder.chunker.dispatch import ChunkMetadata

logger = structlog.get_logger()

__all__ = ["Chunk", "chunk_file", "estimate_tokens", "file_summary_text"]


@overload
def chunk_file(
    path: str,
    content: str,
    chunk_size: int | None = ...,
    overlap: int | None = ...,
    *,
    return_metadata: Literal[False] = ...,
) -> list[Chunk]: ...


@overload
def chunk_file(
    path: str,
    content: str,
    chunk_size: int | None = ...,
    overlap: int | None = ...,
    *,
    return_metadata: Literal[True],
) -> ChunkMetadata: ...


def chunk_file(
    path: str,
    content: str,
    chunk_size: int | None = None,
    overlap: int | None = None,
    *,
    return_metadata: bool = False,
) -> list[Chunk] | ChunkMetadata:
    budget = chunk_size if chunk_size is not None else settings.chunk_size
    over = overlap if overlap is not None else settings.chunk_overlap
    if return_metadata:
        meta: ChunkMetadata = chunk_content(
            path=path, content=content, budget=budget, overlap=over,
            return_metadata=True,
        )
        logger.debug("file_chunked", path=path, chunks_produced=len(meta["chunks"]),
                     input_bytes=len(content))
        return meta
    plain: list[Chunk] = chunk_content(
        path=path, content=content, budget=budget, overlap=over,
        return_metadata=False,
    )
    logger.debug("file_chunked", path=path, chunks_produced=len(plain),
                 input_bytes=len(content))
    return plain


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
