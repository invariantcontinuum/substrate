"""JavaScript plugin.

Imports captured:
  - `import x from "./y"` / `import {a} from "./y"` / `import "./y"`
  - `export {a} from "./y"` / `export * from "./y"`
  - `require("./y")` / `require('./y')`
  - dynamic `import("./y")`

Resolver rules (applied in order until one hits known_files):
  1. Exact: `<target>` already a known file.
  2. Extension speculation: `<target>{.js,.jsx,.mjs,.cjs}`.
  3. Directory index: `<target>/index{.js,.jsx,.mjs,.cjs}`.
  4. Caller-dir-relative (if target starts with `./` or `../`).

Bare module names (no leading `.` or `/`) are NOT speculated into node_modules —
they're skipped. Future: honor `package.json` `workspaces` if demand emerges.
"""

from __future__ import annotations

import os
from collections.abc import Callable

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin

_JS_EXT_CANDIDATES = (".js", ".jsx", ".mjs", ".cjs")

ExtraCandidatesFn = Callable[[str, str, set[str]], str | None]


class JavaScriptPlugin(TreeSitterPlugin):
    language = "javascript"
    grammar_name = "javascript"
    extensions = frozenset({".js", ".jsx", ".mjs", ".cjs"})

    imports_query = """
    (import_statement source: (string (string_fragment) @import.path))
    (export_statement source: (string (string_fragment) @import.path))
    (call_expression
      function: (identifier) @_fn
      arguments: (arguments (string (string_fragment) @import.path))
      (#eq? @_fn "require"))
    (call_expression
      function: (import)
      arguments: (arguments (string (string_fragment) @import.path)))
    """

    symbols_query = """
    (program (function_declaration name: (identifier) @symbol.function))
    (program (export_statement
      declaration: (function_declaration name: (identifier) @symbol.function)))
    (program (class_declaration name: (identifier) @symbol.class))
    (program (export_statement
      declaration: (class_declaration name: (identifier) @symbol.class)))
    (class_body (method_definition name: (property_identifier) @symbol.method))
    """

    def resolve(
        self,
        source_path: str,
        analysis: FileAnalysis,
        known_files: set[str],
        ctx: RepoContext,
    ) -> list[EdgeAffected]:
        return _resolve_js_like(
            source_path, analysis, known_files, ctx,
            ext_candidates=_JS_EXT_CANDIDATES,
        )


def _resolve_js_like(
    source_path: str,
    analysis: FileAnalysis,
    known_files: set[str],
    ctx: RepoContext,
    *,
    ext_candidates: tuple[str, ...],
    extra_candidates: ExtraCandidatesFn | None = None,
) -> list[EdgeAffected]:
    """Shared resolver for JavaScript + TypeScript. Typescript passes additional
    ext_candidates and an `extra_candidates` hook for tsconfig aliases."""
    edges: list[EdgeAffected] = []
    seen: set[str] = set()
    src_dir = os.path.dirname(source_path)

    for raw in analysis.imports:
        if not raw:
            continue
        # Bare module imports: skip.
        if not (raw.startswith("./") or raw.startswith("../") or raw.startswith("/")):
            target: str | None = None
            if extra_candidates is not None:
                target = extra_candidates(raw, src_dir, known_files)
            if target is None:
                continue
            if target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
            continue

        base = os.path.normpath(os.path.join(src_dir, raw.lstrip("/")))
        target = _try_candidates(base, known_files, ext_candidates)
        if target and target != source_path and target not in seen:
            seen.add(target)
            edges.append(EdgeAffected(
                source_id=source_path, target_id=target,
                type="depends", action="add",
            ))
    return edges


def _try_candidates(base: str, known_files: set[str], exts: tuple[str, ...]) -> str | None:
    base = base.replace("\\", "/")
    if base in known_files:
        return base
    for ext in exts:
        if (base + ext) in known_files:
            return base + ext
    for ext in exts:
        candidate = f"{base}/index{ext}"
        if candidate in known_files:
            return candidate
    return None
