"""Orchestrator-level tests for build_graph() itself — independent of
any language plugin. Verifies classification, progress callback cadence,
and symbol-node emission shape.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest

from substrate_graph_builder import build_graph
from substrate_graph_builder.model import FileAnalysis, RepoContext, Symbol

if TYPE_CHECKING:
    from substrate_common.schema import EdgeAffected

    from tests.conftest import BuildTreeFn


def test_build_graph_emits_file_nodes_for_every_blob(
    build_tree: BuildTreeFn,
    tmp_path: Path,
) -> None:
    root, tree = build_tree(tmp_path, {
        "a.py": "x = 1\n",
        "b.txt": "hello\n",
        "nested/c.json": "{}\n",
    })
    doc = build_graph(tree, root)
    ids = {n.id for n in doc.nodes}
    assert ids == {"a.py", "b.txt", "nested/c.json"}


def test_build_graph_classifies_by_extension(
    build_tree: BuildTreeFn,
    tmp_path: Path,
) -> None:
    root, tree = build_tree(tmp_path, {"foo.py": "x=1", "Makefile": "all:", "README.md": "#"})
    doc = build_graph(tree, root)
    by_id = {n.id: n.type for n in doc.nodes}
    assert by_id["foo.py"] == "source"
    assert by_id["Makefile"] == "config"
    assert by_id["README.md"] == "doc"


def test_build_graph_symbol_id_shape(
    build_tree: BuildTreeFn,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verifies that when an analysis carries symbols, they emit the
    expected id format `{file}#{name}@{line}` and a `defines` edge."""
    # patch a plugin into a local registry stand-in
    from substrate_graph_builder import plugins as plugins_mod
    from substrate_graph_builder.registry import PluginRegistry

    class FakePlugin:
        language = "fake"
        extensions = frozenset({".fake"})
        filenames: frozenset[str] = frozenset()
        def parse(self, path: str, content: str, ctx: RepoContext) -> FileAnalysis:
            return FileAnalysis(
                imports=[],
                symbols=[Symbol(name="my_fn", kind="function", line=7)],
            )
        def resolve(
            self,
            source_path: str,
            analysis: FileAnalysis,
            known_files: set[str],
            ctx: RepoContext,
        ) -> list[EdgeAffected]:
            return []

    monkeypatch.setattr(plugins_mod, "REGISTRY", PluginRegistry([FakePlugin()]))
    # builder.py binds REGISTRY at import — patch it there too
    import substrate_graph_builder.builder as builder_mod
    monkeypatch.setattr(builder_mod, "REGISTRY", PluginRegistry([FakePlugin()]))

    root, tree = build_tree(tmp_path, {"x.fake": "whatever"})
    doc = build_graph(tree, root)

    sym_nodes = [n for n in doc.nodes if n.type == "function"]
    assert len(sym_nodes) == 1
    assert sym_nodes[0].id == "x.fake#my_fn@7"
    assert sym_nodes[0].name == "my_fn"
    assert sym_nodes[0].meta["file_path"] == "x.fake"
    assert sym_nodes[0].meta["line"] == 7

    defines: list[Any] = [e for e in doc.edges if e.type == "defines"]
    assert len(defines) == 1
    assert defines[0].source_id == "x.fake"
    assert defines[0].target_id == "x.fake#my_fn@7"
