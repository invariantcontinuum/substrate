"""C++ plugin — handles `.cpp`, `.cxx`, `.cc`, `.hpp`, `.hh`.

Uses the same `#include "path"` rule as C; adds namespace / class body
discovery for symbols. Does NOT handle C++20 modules (`import` / `export
module`); they're rare in real codebases today and tree-sitter-cpp's support
is grammar-level but orthogonal enough to defer until we see demand.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin
from substrate_graph_builder.plugins.c import _resolve_c_include


class CppPlugin(TreeSitterPlugin):
    language = "cpp"
    grammar_name = "cpp"
    extensions = frozenset({".cpp", ".cxx", ".cc", ".hpp", ".hh"})

    imports_query = """
    (preproc_include path: (string_literal) @import.path)
    """

    symbols_query = """
    (translation_unit (function_definition
      declarator: (function_declarator declarator: (identifier) @symbol.function)))
    (translation_unit (class_specifier name: (type_identifier) @symbol.class))
    (translation_unit (struct_specifier name: (type_identifier) @symbol.class))
    (class_specifier body: (field_declaration_list
      (function_definition
        declarator: (function_declarator declarator: (field_identifier) @symbol.method))))
    (struct_specifier body: (field_declaration_list
      (function_definition
        declarator: (function_declarator declarator: (field_identifier) @symbol.method))))
    """

    def resolve(
        self,
        source_path: str,
        analysis: FileAnalysis,
        known_files: set[str],
        ctx: RepoContext,
    ) -> list[EdgeAffected]:
        # Reuses C's include resolver — the `#include "path"` contract is identical.
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
