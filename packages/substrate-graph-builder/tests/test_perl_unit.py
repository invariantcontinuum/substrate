"""Perl plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.perl import PerlPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_use_and_require(tmp_path: Path) -> None:
    p = PerlPlugin()
    src = "use Strict;\nuse My::Module;\nrequire 'util.pl';\n"
    r = p.parse("f.pl", src, _ctx(tmp_path))
    assert any("My::Module" in i for i in r.imports)


def test_resolve_colon_to_pm(tmp_path: Path) -> None:
    p = PerlPlugin()
    analysis = p.parse("bin/x.pl", "use My::Module;\n", _ctx(tmp_path))
    known = {"bin/x.pl", "lib/My/Module.pm"}
    edges = p.resolve("bin/x.pl", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "lib/My/Module.pm" for e in edges)
