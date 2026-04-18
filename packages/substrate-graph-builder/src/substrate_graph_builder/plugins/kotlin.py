"""Kotlin plugin.

Imports: `import foo.bar.Baz` -> FQN. Skip `kotlin.*`, `kotlinx.*`, `java.*`.
Symbols: top-level class/object -> class; top-level `fun` -> function;
methods inside class bodies -> method.
"""

from __future__ import annotations

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class KotlinPlugin(TreeSitterPlugin):
    language = "kotlin"
    grammar_name = "kotlin"
    extensions = frozenset({".kt", ".kts"})

    imports_query = """
    (import_header (identifier) @import.path)
    """

    symbols_query = """
    (source_file (class_declaration (type_identifier) @symbol.class))
    (source_file (object_declaration (type_identifier) @symbol.class))
    (source_file (function_declaration (simple_identifier) @symbol.function))
    (class_body (function_declaration (simple_identifier) @symbol.method))
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
        for raw in analysis.imports:
            if raw.startswith(("kotlin.", "kotlinx.", "java.", "javax.")):
                continue
            target = raw.replace(".", "/") + ".kt"
            if target in known_files and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges
