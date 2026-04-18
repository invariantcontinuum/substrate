"""C plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.c import CPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_quoted_include(tmp_path: Path) -> None:
    p = CPlugin()
    src = '#include "mylib.h"\n#include <stdio.h>\n'
    r = p.parse("main.c", src, _ctx(tmp_path))
    assert any("mylib.h" in i for i in r.imports)


def test_parse_symbols(tmp_path: Path) -> None:
    p = CPlugin()
    src = (
        "int top(void) { return 1; }\n"
        "struct Foo { int x; };\n"
        "typedef int my_int;\n"
    )
    r = p.parse("f.c", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("top", "function") in names
    assert ("Foo", "class") in names
    assert ("my_int", "class") in names


def test_resolve_relative(tmp_path: Path) -> None:
    p = CPlugin()
    analysis = p.parse("src/main.c", '#include "util.h"\n', _ctx(tmp_path))
    edges = p.resolve(
        "src/main.c", analysis, {"src/main.c", "src/util.h"}, _ctx(tmp_path)
    )
    assert any(e.target_id == "src/util.h" for e in edges)


def test_resolve_angle_bracket_dropped(tmp_path: Path) -> None:
    p = CPlugin()
    analysis = p.parse("f.c", "#include <stdio.h>\n", _ctx(tmp_path))
    edges = p.resolve("f.c", analysis, {"f.c"}, _ctx(tmp_path))
    assert edges == []
