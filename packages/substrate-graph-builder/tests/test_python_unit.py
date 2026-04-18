"""Python plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.python import PythonPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_extracts_absolute_import(tmp_path: Path) -> None:
    p = PythonPlugin()
    src = "import os\nimport pkg.mod\nfrom a.b import c\n"
    result = p.parse("f.py", src, _ctx(tmp_path))
    assert "os" in result.imports
    assert "pkg.mod" in result.imports
    assert "a.b" in result.imports


def test_parse_extracts_relative_import(tmp_path: Path) -> None:
    p = PythonPlugin()
    src = "from .x import y\nfrom ..pkg import z\n"
    result = p.parse("pkg/sub/f.py", src, _ctx(tmp_path))
    assert any(i.startswith(".") for i in result.imports)


def test_parse_extracts_top_level_symbols(tmp_path: Path) -> None:
    p = PythonPlugin()
    src = (
        "def top_fn():\n    pass\n"
        "class MyClass:\n    def method(self):\n        pass\n"
    )
    result = p.parse("f.py", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in result.symbols}
    assert ("top_fn", "function") in names
    assert ("MyClass", "class") in names
    assert ("method", "method") in names


def test_resolve_absolute(tmp_path: Path) -> None:
    p = PythonPlugin()
    analysis = p.parse("app/main.py", "import app.helpers\n", _ctx(tmp_path))
    known = {"app/main.py", "app/helpers.py", "app/__init__.py"}
    edges = p.resolve("app/main.py", analysis, known, _ctx(tmp_path))
    targets = {e.target_id for e in edges}
    assert "app/helpers.py" in targets


def test_resolve_relative(tmp_path: Path) -> None:
    p = PythonPlugin()
    analysis = p.parse("pkg/sub/m.py", "from ..other import x\n", _ctx(tmp_path))
    known = {"pkg/sub/m.py", "pkg/other.py", "pkg/__init__.py", "pkg/sub/__init__.py"}
    edges = p.resolve("pkg/sub/m.py", analysis, known, _ctx(tmp_path))
    targets = {e.target_id for e in edges}
    assert "pkg/other.py" in targets


def test_resolve_unresolvable_silently_dropped(tmp_path: Path) -> None:
    p = PythonPlugin()
    analysis = p.parse("f.py", "import third_party_lib\n", _ctx(tmp_path))
    edges = p.resolve("f.py", analysis, {"f.py"}, _ctx(tmp_path))
    assert edges == []
