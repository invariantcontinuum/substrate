"""Java plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.java import JavaPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_imports(tmp_path: Path) -> None:
    p = JavaPlugin()
    src = (
        "package com.acme;\n"
        "import java.util.List;\n"
        "import com.acme.util.Helper;\n"
        "import com.acme.models.*;\n"
        "public class App {}\n"
    )
    r = p.parse("App.java", src, _ctx(tmp_path))
    assert "java.util.List" in r.imports
    assert "com.acme.util.Helper" in r.imports


def test_parse_symbols(tmp_path: Path) -> None:
    p = JavaPlugin()
    src = (
        "public class Foo {\n"
        "  public int bar() { return 1; }\n"
        "  public void baz() {}\n"
        "}\n"
        "interface Quux {\n"
        "  int quuz();\n"
        "}\n"
    )
    r = p.parse("Foo.java", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("Foo", "class") in names
    assert ("Quux", "class") in names
    assert ("bar", "method") in names
    assert ("baz", "method") in names
    assert ("quuz", "method") in names


def test_resolve_fqn(tmp_path: Path) -> None:
    p = JavaPlugin()
    analysis = p.parse(
        "src/App.java",
        "import com.acme.util.Helper;\npublic class App {}\n",
        _ctx(tmp_path),
    )
    known = {"src/App.java", "com/acme/util/Helper.java"}
    edges = p.resolve("src/App.java", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "com/acme/util/Helper.java" for e in edges)


def test_resolve_stdlib_drops(tmp_path: Path) -> None:
    p = JavaPlugin()
    analysis = p.parse("App.java", "import java.util.List;\n", _ctx(tmp_path))
    edges = p.resolve("App.java", analysis, {"App.java"}, _ctx(tmp_path))
    assert edges == []
