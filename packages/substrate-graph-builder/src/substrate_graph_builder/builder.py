"""build_graph() — top-level API consumed by ingestion.

Single-pass pipeline:
  1. Classify every tree blob into a file NodeAffected.
  2. For each file whose plugin exists: read content, plugin.parse() → FileAnalysis.
  3. For each analysis: plugin.resolve() → file→file `depends` edges.
  4. For each analysis: emit symbol NodeAffecteds + file→symbol `defines` edges.

Progress callback signature (`done`, `total`, `meta`) is compatible with the
one ingestion/src/connectors/github.py.sync_repo already feeds through the
SSE progress pipeline.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

import structlog
from substrate_common.schema import EdgeAffected, NodeAffected

from substrate_graph_builder.model import (
    FileAnalysis,
    GraphDocument,
    RepoContext,
    Symbol,
    classify_file_type,
)
from substrate_graph_builder.plugins import REGISTRY

logger = structlog.get_logger()

ProgressFn = Callable[[int, int, dict[str, Any]], Any]


def build_graph(
    tree: list[dict[str, Any]],
    root_dir: str,
    source_name: str = "github",
    on_progress: ProgressFn | None = None,
) -> GraphDocument:
    """Build a GraphDocument from a filesystem tree listing.

    Args:
        tree: entries shaped `{"path": "<repo-relative>", "type": "blob"}`. Only `blob`
              entries are considered; directories/symlinks are skipped.
        root_dir: absolute path where tree is materialized (for reading file contents).
        source_name: value stamped into node.meta["source"].
        on_progress: called as `on_progress(done, total, meta)` during parse phase.
    """
    ctx = RepoContext.from_root(root_dir, source_name=source_name)

    # ---- 1. file nodes ----
    nodes: list[NodeAffected] = [
        _make_file_node(entry["path"], source_name)
        for entry in tree
        if entry.get("type") == "blob"
    ]
    known_files: set[str] = {n.id for n in nodes}

    # ---- 2. parse ----
    parseable: list[tuple[NodeAffected, Any]] = []
    for n in nodes:
        plugin = REGISTRY.get_for_path(n.id)
        if plugin is not None:
            parseable.append((n, plugin))

    total = len(parseable)
    analyses: dict[str, FileAnalysis] = {}
    meta: dict[str, Any] = {"phase": "parsing", "files_parseable": total}
    for i, (node, plugin) in enumerate(parseable):
        content = _read_text(os.path.join(root_dir, node.id))
        if content is None:
            continue
        try:
            analyses[node.id] = plugin.parse(node.id, content, ctx)
        except Exception as exc:  # noqa: BLE001 — per-file failures must not abort the sync
            logger.warning(
                "plugin_parse_failed",
                path=node.id,
                language=plugin.language,
                error=str(exc),
                event="plugin_parse_failed",
            )
            continue
        if on_progress and ((i + 1) % 50 == 0 or i + 1 == total):
            meta.update({"files_parsed": i + 1})
            on_progress(i + 1, total, meta)

    # ---- 3. edges: imports → file→file `depends` ----
    edges: list[EdgeAffected] = []
    for path, analysis in analyses.items():
        plugin = REGISTRY.get_for_path(path)
        if plugin is None:
            continue  # defensive: analyses only holds plugin-matched paths
        try:
            edges.extend(plugin.resolve(path, analysis, known_files, ctx))
        except Exception as exc:  # noqa: BLE001 — resolver failure is per-file, not fatal
            logger.warning(
                "plugin_resolve_failed",
                path=path,
                language=plugin.language,
                error=str(exc),
                event="plugin_resolve_failed",
            )

    # ---- 4. symbol nodes + `defines` edges ----
    for path, analysis in analyses.items():
        for sym in analysis.symbols:
            sym_id = _symbol_id(path, sym)
            nodes.append(_make_symbol_node(sym_id, sym, path, source_name))
            edges.append(EdgeAffected(
                source_id=path,
                target_id=sym_id,
                type="defines",
                action="add",
            ))

    if on_progress:
        on_progress(total, total, {"phase": "publishing",
                                   "files_parsed": total,
                                   "edges_found": len(edges)})

    return GraphDocument(nodes=nodes, edges=edges)


# ---- private helpers ----

def _make_file_node(path: str, source_name: str) -> NodeAffected:
    return NodeAffected(
        id=path,
        name=path.rsplit("/", 1)[-1],
        type=classify_file_type(path),
        action="add",
        domain=path.split("/", 1)[0] if "/" in path else "",
        meta={"source": source_name, "path": path},
    )


def _make_symbol_node(
    sym_id: str,
    sym: Symbol,
    owning_file: str,
    source_name: str,
) -> NodeAffected:
    return NodeAffected(
        id=sym_id,
        name=sym.name,
        type=sym.kind,
        action="add",
        domain=owning_file.split("/", 1)[0] if "/" in owning_file else "",
        meta={
            "source": source_name,
            "file_path": owning_file,
            "line": sym.line,
        },
    )


def _symbol_id(file_path: str, sym: Symbol) -> str:
    return f"{file_path}#{sym.name}@{sym.line}"


def _read_text(path: str) -> str | None:
    try:
        with open(path, errors="replace") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return None
