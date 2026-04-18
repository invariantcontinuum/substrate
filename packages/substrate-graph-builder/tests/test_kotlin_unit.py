"""Kotlin plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.kotlin import KotlinPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_imports(tmp_path: Path) -> None:
    p = KotlinPlugin()
    src = (
        "import com.acme.Foo\n"
        "import kotlin.collections.List\n"
        "class Widget\n"
    )
    r = p.parse("W.kt", src, _ctx(tmp_path))
    assert "com.acme.Foo" in r.imports


def test_parse_symbols(tmp_path: Path) -> None:
    p = KotlinPlugin()
    src = (
        "class Foo {\n"
        "  fun bar() {}\n"
        "}\n"
        "object Util {}\n"
        "fun top() {}\n"
    )
    r = p.parse("f.kt", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("Foo", "class") in names
    assert ("Util", "class") in names
    assert ("top", "function") in names
    assert ("bar", "method") in names


def test_resolve_fqn(tmp_path: Path) -> None:
    p = KotlinPlugin()
    analysis = p.parse("App.kt", "import com.acme.Foo\n", _ctx(tmp_path))
    known = {"App.kt", "com/acme/Foo.kt"}
    edges = p.resolve("App.kt", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "com/acme/Foo.kt" for e in edges)


def test_resolve_stdlib_drops(tmp_path: Path) -> None:
    p = KotlinPlugin()
    analysis = p.parse("App.kt", "import kotlin.collections.List\n", _ctx(tmp_path))
    edges = p.resolve("App.kt", analysis, {"App.kt"}, _ctx(tmp_path))
    assert edges == []
