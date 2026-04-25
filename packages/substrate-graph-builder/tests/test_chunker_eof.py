"""End-of-file coverage tests for the chunker. Files whose trailing lines
sit beyond the last AST construct used to silently drop them; this fixes
that regression and pins the new total_lines metadata."""
from __future__ import annotations

from substrate_graph_builder.chunker import chunk_content


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
