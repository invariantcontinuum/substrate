"""Markdown chunker — splits at heading boundaries, never inside code fences."""
from __future__ import annotations

import re

from substrate_graph_builder.chunker.fallback import chunk_lines
from substrate_graph_builder.chunker.tokens import estimate_tokens
from substrate_graph_builder.chunker.types import Chunk

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_FENCE = re.compile(r"^\s*(```|~~~)")


def _split_sections(content: str) -> list[tuple[str, int, int, str]]:
    """Return list of (section_text, start_line, end_line, heading_or_empty).
    Heading boundaries outside code fences start a new section. Fenced
    code blocks are retained whole inside whichever section they belong
    to."""
    lines = content.split("\n")
    sections: list[tuple[str, int, int, str]] = []
    buf: list[str] = []
    start = 1
    heading = ""
    in_fence = False
    fence_marker: str | None = None

    def flush(end_line: int) -> None:
        nonlocal buf, start, heading
        if any(ln.strip() for ln in buf):
            sections.append(("\n".join(buf), start, end_line, heading))
        buf = []
        heading = ""

    for idx, line in enumerate(lines, start=1):
        fence_match = _FENCE.match(line)
        if fence_match:
            marker = fence_match.group(1)
            if not in_fence:
                in_fence, fence_marker = True, marker
            elif marker == fence_marker:
                in_fence, fence_marker = False, None
            buf.append(line)
            continue

        if not in_fence and (h := _HEADING.match(line)):
            if buf:
                flush(idx - 1)
                start = idx
            heading = h.group(2).strip()
            buf.append(line)
            continue

        buf.append(line)

    flush(len(lines))
    return sections


def chunk_markdown(content: str, budget: int, overlap: int) -> list[Chunk]:
    sections = _split_sections(content)
    chunks: list[Chunk] = []

    for text, start_line, end_line, heading in sections:
        tokens = estimate_tokens(text)
        if tokens <= budget:
            chunks.append(Chunk(
                content=text,
                start_line=start_line,
                end_line=end_line,
                token_count=tokens,
                chunk_type="heading" if heading else "paragraph",
                symbols=[heading] if heading else [],
            ))
            continue
        # Oversized section — line-greedy split, retaining the heading.
        for sub in chunk_lines(text, budget=budget, overlap=overlap):
            chunks.append(Chunk(
                content=sub.content,
                start_line=start_line + sub.start_line - 1,
                end_line=start_line + sub.end_line - 1,
                token_count=sub.token_count,
                chunk_type="heading" if heading else "paragraph",
                symbols=[heading] if heading else [],
            ))
    return chunks
