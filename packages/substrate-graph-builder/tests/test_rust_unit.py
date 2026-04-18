"""Rust plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.rust import RustPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_use_and_mod(tmp_path: Path) -> None:
    p = RustPlugin()
    src = "use crate::lib::helpers;\nmod util;\nuse std::io::Read;\n"
    r = p.parse("src/main.rs", src, _ctx(tmp_path))
    assert any("helpers" in s for s in r.imports)
    assert "util" in r.imports


def test_parse_symbols(tmp_path: Path) -> None:
    p = RustPlugin()
    src = (
        "fn top() {}\n"
        "struct Foo;\n"
        "trait Bar {}\n"
        "impl Foo { fn method(&self) {} }\n"
    )
    r = p.parse("f.rs", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("top", "function") in names
    assert ("Foo", "class") in names
    assert ("Bar", "class") in names
    assert ("method", "method") in names


def test_resolve_mod(tmp_path: Path) -> None:
    p = RustPlugin()
    analysis = p.parse("src/main.rs", "mod util;\n", _ctx(tmp_path))
    known = {"src/main.rs", "src/util.rs"}
    edges = p.resolve("src/main.rs", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "src/util.rs" for e in edges)


def test_resolve_use_crate_prefix(tmp_path: Path) -> None:
    p = RustPlugin()
    analysis = p.parse("src/main.rs", "use crate::lib::helpers;\n", _ctx(tmp_path))
    known = {"src/main.rs", "src/lib/helpers.rs"}
    edges = p.resolve("src/main.rs", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "src/lib/helpers.rs" for e in edges)
