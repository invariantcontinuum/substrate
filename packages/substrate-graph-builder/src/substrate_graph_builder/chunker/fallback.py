"""Line-greedy fallback used when no semantic/AST plugin matches."""
from __future__ import annotations

from substrate_graph_builder.chunker.tokens import estimate_tokens
from substrate_graph_builder.chunker.types import Chunk


def chunk_lines(content: str, budget: int, overlap: int) -> list[Chunk]:
    lines = content.split("\n")
    chunks: list[Chunk] = []
    current_lines: list[str] = []
    current_tokens = 0
    start_line = 1

    for i, line in enumerate(lines, start=1):
        line_tokens = estimate_tokens(line)
        current_lines.append(line)
        current_tokens += line_tokens

        if current_tokens >= budget:
            chunks.append(Chunk(
                content="\n".join(current_lines),
                start_line=start_line,
                end_line=i,
                token_count=current_tokens,
                chunk_type="line",
            ))

            overlap_lines: list[str] = []
            overlap_tokens = 0
            for prev_line in reversed(current_lines):
                lt = estimate_tokens(prev_line)
                if overlap_tokens + lt > overlap:
                    break
                overlap_lines.insert(0, prev_line)
                overlap_tokens += lt

            current_lines = overlap_lines
            current_tokens = overlap_tokens
            start_line = i - len(overlap_lines) + 1

    if current_lines:
        rest = "\n".join(current_lines)
        chunks.append(Chunk(
            content=rest,
            start_line=start_line,
            end_line=len(lines),
            token_count=current_tokens,
            chunk_type="line",
        ))
    return chunks
