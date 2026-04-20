"""Public entrypoint — resolves the right chunker for a file and
post-processes the result (breadcrumbs, chunk_index, language)."""
from __future__ import annotations

from pathlib import Path

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


def chunk_content(
    path: str,
    content: str,
    budget: int = 512,
    overlap: int = 64,
    add_breadcrumb: bool = True,
) -> list[Chunk]:
    """Dispatch a file to the right chunker and return annotated chunks.

    The returned chunks carry:
      - `chunk_index` in source order
      - `language` populated from the matching plugin (or "markdown" /
        "text" / "" for non-AST paths)
      - `content` optionally prefixed with a breadcrumb header

    Empty / whitespace-only content returns []."""
    if not content.strip():
        return []

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

    for idx, ch in enumerate(chunks):
        ch.chunk_index = idx
        ch.language = language
        if add_breadcrumb:
            header = _breadcrumb(path, ch)
            ch.content = f"{header}\n\n{ch.content}"
            ch.token_count = estimate_tokens(ch.content)
    return chunks
