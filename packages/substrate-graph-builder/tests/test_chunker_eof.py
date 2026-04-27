"""End-of-file coverage tests for the chunker. Files whose trailing lines
sit beyond the last AST construct used to silently drop them; this fixes
that regression and pins the new total_lines metadata."""
from __future__ import annotations

from substrate_graph_builder.chunker import chunk_content
from substrate_graph_builder.chunker.dispatch import _ensure_eof_coverage
from substrate_graph_builder.chunker.tokens import estimate_tokens
from substrate_graph_builder.chunker.types import Chunk


def test_python_file_with_trailing_comment_is_fully_covered():
    body_lines = [f"def fn{i}():" for i in range(1, 6)]
    body_lines = [line for fn in body_lines for line in (fn, "    return None", "")]
    src = "\n".join(body_lines) + "# trailing module-level comment\n"
    expected_total = src.count("\n")
    chunks = chunk_content(path="x.py", content=src, budget=512, overlap=32)
    covered: set[int] = set()
    for c in chunks:
        covered.update(range(c.start_line, c.end_line + 1))
    missing = set(range(1, expected_total + 1)) - covered
    assert not missing, f"missing lines: {sorted(missing)[:10]}"
    assert max(c.end_line for c in chunks) == expected_total


def test_chunker_returns_total_lines_metadata():
    src = "alpha\nbeta\ngamma\n"
    result = chunk_content(path="x.txt", content=src, budget=512, overlap=32,
                           return_metadata=True)
    assert result["total_lines"] == 3
    assert all(c.start_line >= 1 for c in result["chunks"])


def _stub_chunk(start: int, end: int, content: str) -> Chunk:
    """Hand-build a Chunk for direct helper testing — no real chunker
    output, just the fields _ensure_eof_coverage reads."""
    return Chunk(
        chunk_index=0, content=content,
        start_line=start, end_line=end,
        token_count=estimate_tokens(content),
    )


def test_ensure_eof_coverage_appends_tail_when_chunks_stop_short():
    src = "line1\nline2\nline3\ntrailing comment past last construct\n"
    # Pretend the AST chunker only produced lines 1-3 and missed line 4.
    chunks = [_stub_chunk(1, 3, "line1\nline2\nline3")]
    out = _ensure_eof_coverage(chunks, src, total_lines=4)
    assert len(out) == 2
    assert out[1].start_line == 4
    assert out[1].end_line == 4
    assert "trailing comment" in out[1].content


def test_ensure_eof_coverage_no_op_when_already_covering_eof():
    src = "line1\nline2\n"
    chunks = [_stub_chunk(1, 2, "line1\nline2")]
    out = _ensure_eof_coverage(chunks, src, total_lines=2)
    assert out is chunks  # same object, no copy


def test_ensure_eof_coverage_emits_blank_only_tail():
    src = "line1\nline2\n\n\n\n"
    chunks = [_stub_chunk(1, 2, "line1\nline2")]
    out = _ensure_eof_coverage(chunks, src, total_lines=5)
    # Blank-only tail MUST produce a chunk so line_count stays accurate
    # for file reconstruction and the viewer shows the right total lines.
    assert len(out) == 2
    assert out[1].start_line == 3
    assert out[1].end_line == 5
