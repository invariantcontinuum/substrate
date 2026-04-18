"""Shell plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.shell import ShellPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_source_and_dot(tmp_path: Path) -> None:
    p = ShellPlugin()
    src = "#!/bin/bash\nsource lib/util.sh\n. lib/helpers.sh\n"
    r = p.parse("main.sh", src, _ctx(tmp_path))
    assert any("util.sh" in i for i in r.imports)
    assert any("helpers.sh" in i for i in r.imports)


def test_parse_function_symbol(tmp_path: Path) -> None:
    p = ShellPlugin()
    src = "greet() {\n  echo hi\n}\n"
    r = p.parse("s.sh", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("greet", "function") in names


def test_resolve_relative(tmp_path: Path) -> None:
    p = ShellPlugin()
    analysis = p.parse("bin/main.sh", "source lib/util.sh\n", _ctx(tmp_path))
    edges = p.resolve(
        "bin/main.sh", analysis, {"bin/main.sh", "bin/lib/util.sh"}, _ctx(tmp_path)
    )
    assert any(e.target_id == "bin/lib/util.sh" for e in edges)
