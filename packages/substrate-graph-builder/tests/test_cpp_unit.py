"""C++ plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.cpp import CppPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_class_with_method(tmp_path: Path) -> None:
    p = CppPlugin()
    src = (
        "class Foo {\n"
        "public:\n"
        "  void bar() {}\n"
        "};\n"
        "struct Bar {\n"
        "  int baz() { return 1; }\n"
        "};\n"
        "int top() { return 0; }\n"
    )
    r = p.parse("f.cpp", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("Foo", "class") in names
    assert ("Bar", "class") in names
    assert ("bar", "method") in names
    assert ("baz", "method") in names
    assert ("top", "function") in names


def test_resolve_include(tmp_path: Path) -> None:
    p = CppPlugin()
    analysis = p.parse("src/main.cpp", '#include "util.hpp"\n', _ctx(tmp_path))
    edges = p.resolve(
        "src/main.cpp", analysis,
        {"src/main.cpp", "src/util.hpp"}, _ctx(tmp_path),
    )
    assert any(e.target_id == "src/util.hpp" for e in edges)
