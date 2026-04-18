"""PHP plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.php import PhpPlugin


def _ctx(tmp_path: Path, psr4: dict[str, list[str]] | None = None) -> RepoContext:
    return RepoContext(
        root_dir=str(tmp_path), source_name="github",
        php_psr4=psr4 or {},
    )


def test_parse_include_and_use(tmp_path: Path) -> None:
    p = PhpPlugin()
    src = (
        "<?php\n"
        "require_once 'util.php';\n"
        "use App\\Models\\User;\n"
        "class Widget {}\n"
    )
    r = p.parse("f.php", src, _ctx(tmp_path))
    assert any("util.php" in i for i in r.imports)
    assert any("App\\Models\\User" in i for i in r.imports)


def test_parse_symbols(tmp_path: Path) -> None:
    p = PhpPlugin()
    src = (
        "<?php\n"
        "function top() {}\n"
        "class Foo { public function bar() {} }\n"
        "interface Baz {}\n"
        "trait T {}\n"
    )
    r = p.parse("f.php", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("top", "function") in names
    assert ("Foo", "class") in names
    assert ("bar", "method") in names
    assert ("Baz", "class") in names
    assert ("T", "class") in names


def test_resolve_psr4(tmp_path: Path) -> None:
    p = PhpPlugin()
    ctx = _ctx(tmp_path, psr4={"App": ["src"]})
    analysis = p.parse("bootstrap.php", "<?php\nuse App\\Models\\User;\n", ctx)
    known = {"bootstrap.php", "src/Models/User.php"}
    edges = p.resolve("bootstrap.php", analysis, known, ctx)
    assert any(e.target_id == "src/Models/User.php" for e in edges)


def test_resolve_relative_include(tmp_path: Path) -> None:
    p = PhpPlugin()
    ctx = _ctx(tmp_path)
    analysis = p.parse("app/main.php", "<?php\nrequire 'util.php';\n", ctx)
    edges = p.resolve("app/main.php", analysis, {"app/main.php", "app/util.php"}, ctx)
    assert any(e.target_id == "app/util.php" for e in edges)
