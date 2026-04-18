"""CMake plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.cmake import CMakePlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_include(tmp_path: Path) -> None:
    p = CMakePlugin()
    src = 'include(helpers)\ninclude("compiler.cmake")\nfind_package(OpenSSL)\n'
    r = p.parse("CMakeLists.txt", src, _ctx(tmp_path))
    assert "helpers" in r.imports
    assert "compiler.cmake" in r.imports


def test_parse_function_and_macro(tmp_path: Path) -> None:
    p = CMakePlugin()
    src = (
        "function(my_fn arg1)\n  message(${arg1})\nendfunction()\n"
        "macro(my_macro x)\n  message(${x})\nendmacro()\n"
    )
    r = p.parse("CMakeLists.txt", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("my_fn", "function") in names
    assert ("my_macro", "function") in names


def test_resolve_include_with_ext_speculation(tmp_path: Path) -> None:
    p = CMakePlugin()
    analysis = p.parse("CMakeLists.txt", "include(helpers)\n", _ctx(tmp_path))
    known = {"CMakeLists.txt", "helpers.cmake"}
    edges = p.resolve("CMakeLists.txt", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "helpers.cmake" for e in edges)
