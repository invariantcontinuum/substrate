"""PHP plugin.

Imports:
  - `include "path";` / `require "path";` (+ `_once` variants) -> quoted path.
  - `use Foo\\Bar\\Baz;` -> namespace; resolved via composer.json PSR-4 if present.

Symbols: top-level class/interface/trait/function. Methods inside class bodies.

Query note: the plan referenced `(string (string_value) ...)`, but
tree-sitter-php's actual node is `string_content`. Additionally, double-quoted
literals live under `encapsed_string` (not `string`). Queries adjusted to both
single-quote `string` and double-quote `encapsed_string` wrappers so both
include/require styles capture.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class PhpPlugin(TreeSitterPlugin):
    language = "php"
    grammar_name = "php"
    extensions = frozenset({".php"})

    imports_query = """
    (include_expression (string (string_content) @import.path))
    (include_expression (encapsed_string (string_content) @import.path))
    (include_once_expression (string (string_content) @import.path))
    (include_once_expression (encapsed_string (string_content) @import.path))
    (require_expression (string (string_content) @import.path))
    (require_expression (encapsed_string (string_content) @import.path))
    (require_once_expression (string (string_content) @import.path))
    (require_once_expression (encapsed_string (string_content) @import.path))
    (namespace_use_declaration
      (namespace_use_clause (qualified_name) @import.namespace))
    """

    symbols_query = """
    (program (class_declaration name: (name) @symbol.class))
    (program (interface_declaration name: (name) @symbol.class))
    (program (trait_declaration name: (name) @symbol.class))
    (program (function_definition name: (name) @symbol.function))
    (declaration_list (method_declaration name: (name) @symbol.method))
    """

    def resolve(
        self,
        source_path: str,
        analysis: FileAnalysis,
        known_files: set[str],
        ctx: RepoContext,
    ) -> list[EdgeAffected]:
        edges: list[EdgeAffected] = []
        seen: set[str] = set()
        src_dir = os.path.dirname(source_path)
        for raw in analysis.imports:
            target: str | None = None
            if "\\" in raw:
                target = _resolve_php_namespace(raw, ctx, known_files)
            else:
                # quoted include/require — caller-relative
                candidate = os.path.normpath(
                    os.path.join(src_dir, raw.strip())
                ).replace("\\", "/")
                if candidate in known_files:
                    target = candidate
                elif raw in known_files:
                    target = raw
            if target and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges


def _resolve_php_namespace(
    raw: str,
    ctx: RepoContext,
    known_files: set[str],
) -> str | None:
    """`App\\Foo\\Bar` -> longest-prefix match in ctx.php_psr4."""
    raw_parts = raw.lstrip("\\").split("\\")
    for i in range(len(raw_parts), 0, -1):
        prefix = "\\".join(raw_parts[:i])
        targets = ctx.php_psr4.get(prefix)
        if not targets:
            continue
        remainder = "/".join(raw_parts[i:])
        for t in targets:
            candidate = f"{t}/{remainder}.php" if remainder else f"{t}.php"
            candidate = os.path.normpath(candidate).replace("\\", "/")
            if candidate in known_files:
                return candidate
    return None
