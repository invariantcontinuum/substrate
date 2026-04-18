"""Go plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.go import GoPlugin


def _ctx(tmp_path: Path, module: str = "github.com/acme/app") -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github", go_module=module)


def test_parse_single_and_grouped_imports(tmp_path: Path) -> None:
    p = GoPlugin()
    src = (
        'package main\n'
        'import "github.com/acme/app/lib"\n'
        'import (\n'
        '  "github.com/acme/app/util"\n'
        '  "fmt"\n'
        ')\n'
    )
    r = p.parse("main.go", src, _ctx(tmp_path))
    assert "github.com/acme/app/lib" in r.imports
    assert "github.com/acme/app/util" in r.imports
    assert "fmt" in r.imports


def test_parse_symbols(tmp_path: Path) -> None:
    p = GoPlugin()
    src = (
        "package main\n"
        "func Foo() {}\n"
        "type Bar struct{}\n"
        "func (b *Bar) Baz() {}\n"
    )
    r = p.parse("main.go", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("Foo", "function") in names
    assert ("Bar", "class") in names
    assert ("Baz", "method") in names


def test_resolve_package_import_expands_to_dir_files(tmp_path: Path) -> None:
    p = GoPlugin()
    ctx = _ctx(tmp_path)
    analysis = p.parse(
        "cmd/main.go",
        'package main\nimport "github.com/acme/app/lib"\n',
        ctx,
    )
    known = {
        "cmd/main.go", "lib/a.go", "lib/b.go", "lib/sub/c.go",
        "go.mod",
    }
    edges = p.resolve("cmd/main.go", analysis, known, ctx)
    targets = {e.target_id for e in edges}
    assert "lib/a.go" in targets
    assert "lib/b.go" in targets
    # `lib/sub/c.go` is nested deeper — NOT part of the lib package
    assert "lib/sub/c.go" not in targets


def test_resolve_stdlib_drops(tmp_path: Path) -> None:
    p = GoPlugin()
    ctx = _ctx(tmp_path)
    analysis = p.parse("f.go", 'package main\nimport "fmt"\n', ctx)
    edges = p.resolve("f.go", analysis, {"f.go"}, ctx)
    assert edges == []
