"""C plugin — handles `.c` + `.h`.

Imports: only `#include "path"` (quoted form). `#include <sys/...>` dropped.
Symbols: top-level functions, structs, unions, typedefs.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class CPlugin(TreeSitterPlugin):
    language = "c"
    grammar_name = "c"
    extensions = frozenset({".c", ".h"})

    imports_query = """
    (preproc_include path: (string_literal) @import.path)
    """

    symbols_query = """
    (translation_unit (function_definition
      declarator: (function_declarator declarator: (identifier) @symbol.function)))
    (translation_unit (struct_specifier name: (type_identifier) @symbol.class))
    (translation_unit (union_specifier name: (type_identifier) @symbol.class))
    (translation_unit (type_definition
      declarator: (type_identifier) @symbol.class))
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
            target = _resolve_c_include(raw, src_dir, known_files)
            if target and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges


def _resolve_c_include(raw: str, src_dir: str, known_files: set[str]) -> str | None:
    # `include` query captures the full `"foo.h"` string-literal — strip quotes.
    raw = raw.strip()
    if raw.startswith('"') and raw.endswith('"'):
        raw = raw[1:-1]
    elif raw.startswith("<"):
        # angle-bracket includes are system headers — skip
        return None
    candidate = os.path.normpath(os.path.join(src_dir, raw)).replace("\\", "/")
    if candidate in known_files:
        return candidate
    # Also try raw-as-repo-relative (some projects include by repo path).
    if raw in known_files:
        return raw
    return None
