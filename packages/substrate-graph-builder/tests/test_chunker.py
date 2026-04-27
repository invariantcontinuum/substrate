"""Chunker dispatcher + per-strategy tests.

The AST path is exercised via the real Python plugin (tree-sitter).
Markdown/text/fallback paths need no external grammar.
"""
from __future__ import annotations

import itertools

from substrate_graph_builder.chunker import Chunk, chunk_content
from substrate_graph_builder.chunker.fallback import chunk_lines
from substrate_graph_builder.chunker.markdown import chunk_markdown
from substrate_graph_builder.chunker.text import chunk_text


def _assert_invariants(chunks: list[Chunk], path: str) -> None:
    assert chunks, "empty result"
    for i, ch in enumerate(chunks):
        assert ch.chunk_index == i, f"chunk_index drift at {i}"
        assert ch.start_line >= 1
        assert ch.end_line >= ch.start_line
        assert ch.content.strip(), f"empty chunk at {i}"
        assert ch.content.startswith(f"# file: {path}"), "missing breadcrumb"


def test_python_ast_splits_on_top_level_defs():
    src = (
        "import os\n"
        "\n"
        "def foo():\n"
        "    return 1\n"
        "\n"
        "class Bar:\n"
        "    def hello(self):\n"
        "        return 'hi'\n"
    )
    # Tight budget so merge keeps constructs separate.
    chunks = chunk_content("thing.py", src, budget=10)
    _assert_invariants(chunks, "thing.py")
    assert any(c.chunk_type == "function" and "foo" in c.symbols for c in chunks)
    assert any(c.chunk_type == "class" and "Bar" in c.symbols for c in chunks)
    for c in chunks:
        assert c.language == "python"


def test_python_ast_recurses_oversized_class():
    body = "\n".join(f"    x{i} = {i}" for i in range(400))
    src = f"class Big:\n{body}\n"
    chunks = chunk_content("big.py", src, budget=50)
    _assert_invariants(chunks, "big.py")
    # The outer class should have spawned several sub-chunks via line split.
    assert len(chunks) > 1


def test_markdown_splits_on_headings_preserves_fences():
    src = (
        "# Title\n"
        "Intro paragraph.\n"
        "\n"
        "## Section A\n"
        "```python\n"
        "# heading-looking line inside fence\n"
        "x = 1\n"
        "```\n"
        "\n"
        "## Section B\n"
        "More text.\n"
    )
    chunks = chunk_content("doc.md", src, budget=4096)
    _assert_invariants(chunks, "doc.md")
    headings = [c.symbols[0] for c in chunks if c.symbols]
    assert "Title" in headings
    assert "Section A" in headings
    assert "Section B" in headings
    # Fenced code must not have produced a spurious 'heading' chunk.
    assert all("heading-looking line inside fence" not in (c.symbols[0] if c.symbols else "")
               for c in chunks)
    assert all(c.language == "markdown" for c in chunks)


def test_text_paragraphs_pack_greedy():
    src = "para one\nline two\n\npara two\n\npara three line"
    raw = chunk_text(src, budget=4096, overlap=0)
    assert len(raw) == 1  # all pack into one under a big budget
    assert "para one" in raw[0].content and "para three" in raw[0].content


def test_unknown_extension_falls_through_to_line_greedy():
    src = "\n".join(f"line {i}" for i in range(50))
    chunks = chunk_content("data.weird", src, budget=50, overlap=10)
    _assert_invariants(chunks, "data.weird")
    assert all(c.chunk_type == "line" for c in chunks)
    assert all(c.language == "" for c in chunks)


def test_empty_content_returns_empty():
    assert chunk_content("foo.py", "") == []
    assert chunk_content("foo.py", "   \n\n  ") == []


def test_fallback_line_greedy_respects_budget():
    src = "\n".join(f"line number {i}" for i in range(100))
    chunks = chunk_lines(src, budget=20, overlap=4)
    assert len(chunks) >= 3
    # Overlap means consecutive start_line should be lower than previous end_line.
    for a, b in itertools.pairwise(chunks):
        assert b.start_line <= a.end_line + 1


def test_markdown_oversized_section_splits_line_greedy():
    body = "\n".join(f"word{i} " * 5 for i in range(400))
    src = f"## Huge\n{body}\n"
    chunks = chunk_markdown(src, budget=100, overlap=10)
    assert len(chunks) > 1
    assert all(c.symbols == ["Huge"] for c in chunks)
