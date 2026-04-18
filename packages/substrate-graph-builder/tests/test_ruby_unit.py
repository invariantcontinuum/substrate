"""Ruby plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.ruby import RubyPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_require_variants(tmp_path: Path) -> None:
    p = RubyPlugin()
    src = (
        'require "pathname"\n'
        'require_relative "./helper"\n'
        'load "util.rb"\n'
    )
    r = p.parse("app/a.rb", src, _ctx(tmp_path))
    assert "pathname" in r.imports
    assert "./helper" in r.imports
    assert "util.rb" in r.imports


def test_parse_symbols(tmp_path: Path) -> None:
    p = RubyPlugin()
    src = (
        "class Foo\n"
        "  def bar; end\n"
        "end\n"
        "module Bar\n"
        "  def baz; end\n"
        "end\n"
    )
    r = p.parse("f.rb", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("Foo", "class") in names
    assert ("Bar", "class") in names
    assert ("bar", "method") in names
    assert ("baz", "method") in names


def test_resolve_require_relative(tmp_path: Path) -> None:
    p = RubyPlugin()
    analysis = p.parse("app/main.rb", 'require_relative "./helper"\n', _ctx(tmp_path))
    known = {"app/main.rb", "app/helper.rb"}
    edges = p.resolve("app/main.rb", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "app/helper.rb" for e in edges)


def test_resolve_require_lib_prefix(tmp_path: Path) -> None:
    p = RubyPlugin()
    analysis = p.parse("bin/a.rb", 'require "widgets"\n', _ctx(tmp_path))
    known = {"bin/a.rb", "lib/widgets.rb"}
    edges = p.resolve("bin/a.rb", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "lib/widgets.rb" for e in edges)
