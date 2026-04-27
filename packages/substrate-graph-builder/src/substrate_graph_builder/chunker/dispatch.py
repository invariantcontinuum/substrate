"""Public entrypoint — resolves the right chunker for a file and
post-processes the result (breadcrumbs, chunk_index, language)."""
from __future__ import annotations

from pathlib import Path
from typing import Literal, TypedDict, overload

from substrate_graph_builder.chunker.ast import chunk_ast
from substrate_graph_builder.chunker.fallback import chunk_lines
from substrate_graph_builder.chunker.markdown import chunk_markdown
from substrate_graph_builder.chunker.text import chunk_text
from substrate_graph_builder.chunker.tokens import estimate_tokens
from substrate_graph_builder.chunker.types import Chunk
from substrate_graph_builder.plugins import REGISTRY

_MARKDOWN_EXTS = frozenset({".md", ".markdown", ".mdx"})
_TEXT_EXTS = frozenset({".txt", ".rst", ".adoc"})


def _breadcrumb(path: str, chunk: Chunk) -> str:
    parts = [f"# file: {path}"]
    if chunk.symbols:
        parts.append(f"# in: {' > '.join(chunk.symbols)}")
    return "\n".join(parts)


def _count_lines(content: str) -> int:
    """Number of source lines; trailing newline does NOT add a phantom line."""
    if not content:
        return 0
    return content.count("\n") + (0 if content.endswith("\n") else 1)


def _ensure_eof_coverage(
    chunks: list[Chunk], content: str, total_lines: int,
) -> list[Chunk]:
    """If chunks don't cover [last_chunk.end_line+1 .. total_lines], emit
    a trailing-gap chunk capturing the residual text. Cheap no-op when
    coverage is already complete."""
    if not chunks:
        return chunks
    last_end = max(c.end_line for c in chunks)
    if last_end >= total_lines:
        return chunks
    lines = content.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    tail = "\n".join(lines[last_end:total_lines])
    chunks = list(chunks)
    chunks.append(Chunk(
        content=tail,
        start_line=last_end + 1,
        end_line=total_lines,
        token_count=estimate_tokens(tail),
        chunk_type="block",
    ))
    return chunks


def _dispatch_and_collect(
    path: str,
    content: str,
    budget: int,
    overlap: int,
) -> tuple[list[Chunk], str]:
    """Run the right chunker for `path` and return raw chunks + the
    language tag. No annotation (chunk_index / breadcrumb) yet — the
    caller adds those after EOF coverage is enforced."""
    suffix = Path(path).suffix.lower()
    plugin = REGISTRY.get_for_path(path)
    chunks: list[Chunk]
    language: str

    if plugin is not None:
        plugin._ensure_loaded()  # type: ignore[attr-defined]
        assert plugin._parser is not None  # type: ignore[attr-defined]
        chunks = chunk_ast(plugin._parser, content, budget=budget)  # type: ignore[attr-defined]
        language = plugin.language
        if not chunks:
            # Parsers occasionally return empty tops (all top-level is
            # text/comments). Fall through to line-greedy so we still
            # index the file.
            chunks = chunk_lines(content, budget=budget, overlap=overlap)
    elif suffix in _MARKDOWN_EXTS:
        chunks = chunk_markdown(content, budget=budget, overlap=overlap)
        language = "markdown"
    elif suffix in _TEXT_EXTS:
        chunks = chunk_text(content, budget=budget, overlap=overlap)
        language = "text"
    else:
        chunks = chunk_lines(content, budget=budget, overlap=overlap)
        language = ""

    return chunks, language


class ChunkMetadata(TypedDict):
    chunks: list[Chunk]
    total_lines: int


@overload
def chunk_content(
    path: str,
    content: str,
    budget: int = ...,
    overlap: int = ...,
    add_breadcrumb: bool = ...,
    *,
    return_metadata: Literal[False] = ...,
) -> list[Chunk]: ...


@overload
def chunk_content(
    path: str,
    content: str,
    budget: int = ...,
    overlap: int = ...,
    add_breadcrumb: bool = ...,
    *,
    return_metadata: Literal[True],
) -> ChunkMetadata: ...


def chunk_content(
    path: str,
    content: str,
    budget: int = 512,
    overlap: int = 64,
    add_breadcrumb: bool = True,
    *,
    return_metadata: bool = False,
) -> list[Chunk] | ChunkMetadata:
    """Dispatch a file to the right chunker and return annotated chunks.

    The returned chunks carry:
      - `chunk_index` in source order
      - `language` populated from the matching plugin (or "markdown" /
        "text" / "" for non-AST paths)
      - `content` optionally prefixed with a breadcrumb header

    When ``return_metadata`` is True, returns
    ``{"chunks": [...], "total_lines": int}`` instead of the bare list,
    so callers can persist a coverage-aware total line count for
    downstream reconstruction.

    Empty / whitespace-only content returns [] (or
    ``{"chunks": [], "total_lines": <n>}`` when ``return_metadata``)."""
    total_lines = _count_lines(content)
    if not content.strip():
        return {"chunks": [], "total_lines": total_lines} if return_metadata else []

    chunks, language = _dispatch_and_collect(path, content, budget, overlap)
    chunks = _ensure_eof_coverage(chunks, content, total_lines)

    for idx, ch in enumerate(chunks):
        ch.chunk_index = idx
        ch.language = language
        if add_breadcrumb:
            header = _breadcrumb(path, ch)
            ch.content = f"{header}\n\n{ch.content}"
            ch.token_count = estimate_tokens(ch.content)

    if return_metadata:
        return {"chunks": chunks, "total_lines": total_lines}
    return chunks
