"""Plain-text chunker — paragraph-aware greedy pack."""
from __future__ import annotations

from substrate_graph_builder.chunker.fallback import chunk_lines
from substrate_graph_builder.chunker.tokens import estimate_tokens
from substrate_graph_builder.chunker.types import Chunk


def _paragraphs(content: str) -> list[tuple[str, int, int]]:
    """Return (para_text, start_line, end_line). A paragraph ends at a
    blank line."""
    lines = content.split("\n")
    out: list[tuple[str, int, int]] = []
    buf: list[str] = []
    start = 1
    for i, line in enumerate(lines, start=1):
        if line.strip():
            if not buf:
                start = i
            buf.append(line)
        else:
            if buf:
                out.append(("\n".join(buf), start, i - 1))
                buf = []
    if buf:
        out.append(("\n".join(buf), start, len(lines)))
    return out


def chunk_text(content: str, budget: int, overlap: int) -> list[Chunk]:
    paragraphs = _paragraphs(content)
    chunks: list[Chunk] = []
    pack: list[tuple[str, int, int, int]] = []  # (text, start, end, tokens)
    pack_tokens = 0

    def flush() -> None:
        nonlocal pack, pack_tokens
        if not pack:
            return
        combined = "\n\n".join(p[0] for p in pack)
        chunks.append(Chunk(
            content=combined,
            start_line=pack[0][1],
            end_line=pack[-1][2],
            token_count=pack_tokens,
            chunk_type="paragraph",
        ))
        pack = []
        pack_tokens = 0

    for text, start, end in paragraphs:
        tokens = estimate_tokens(text)
        if tokens > budget:
            flush()
            for sub in chunk_lines(text, budget=budget, overlap=overlap):
                chunks.append(Chunk(
                    content=sub.content,
                    start_line=start + sub.start_line - 1,
                    end_line=start + sub.end_line - 1,
                    token_count=sub.token_count,
                    chunk_type="paragraph",
                ))
            continue
        if pack_tokens + tokens > budget:
            flush()
        pack.append((text, start, end, tokens))
        pack_tokens += tokens
    flush()
    return chunks
