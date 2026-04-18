"""Shell plugin — covers `.sh`, `.bash`, `.zsh`.

Imports: `source file` and `. file` (POSIX dot).
No class concept; symbols are function definitions only.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class ShellPlugin(TreeSitterPlugin):
    language = "shell"
    grammar_name = "bash"
    extensions = frozenset({".sh", ".bash", ".zsh"})

    imports_query = """
    (command
      name: (command_name (word) @_cmd)
      argument: (word) @import.path
      (#match? @_cmd "^(source|\\\\.)$"))
    (command
      name: (command_name (word) @_cmd)
      argument: (string) @import.path
      (#match? @_cmd "^(source|\\\\.)$"))
    """

    symbols_query = """
    (function_definition name: (word) @symbol.function)
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
            raw = raw.strip().strip('"\'')
            # expand $VAR / ${VAR} — can't resolve dynamically; skip
            if "$" in raw:
                continue
            candidate = os.path.normpath(os.path.join(src_dir, raw)).replace("\\", "/")
            target: str | None = (
                candidate if candidate in known_files
                else (raw if raw in known_files else None)
            )
            if target and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges
