"""CMake plugin — covers `.cmake` files and `CMakeLists.txt`.

Imports: `include(path)` relative. `find_package(...)` refers to an external
package — no local resolution.
Symbols: `function(name)` / `macro(name)` -> function (first argument only).

Query note: the plan's templates used `(function_def (function_command
(argument) @...))` which errors against tree-sitter-cmake's actual shape —
`argument` lives inside `argument_list`. Queries adjusted to `(argument_list
(argument) @...)` and anchored to the first argument to avoid capturing
positional parameters as symbols.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class CMakePlugin(TreeSitterPlugin):
    language = "cmake"
    grammar_name = "cmake"
    extensions = frozenset({".cmake"})
    filenames = frozenset({"CMakeLists.txt"})

    imports_query = """
    (normal_command
      (identifier) @_cmd
      (argument_list (argument) @import.path)
      (#eq? @_cmd "include"))
    """

    symbols_query = """
    (function_def
      (function_command
        (argument_list . (argument) @symbol.function)))
    (macro_def
      (macro_command
        (argument_list . (argument) @symbol.function)))
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
            # Speculate `.cmake` suffix if not present
            candidates = [raw, f"{raw}.cmake"]
            target: str | None = None
            for t in candidates:
                candidate = os.path.normpath(os.path.join(src_dir, t)).replace("\\", "/")
                if candidate in known_files:
                    target = candidate
                    break
                if t in known_files:
                    target = t
                    break
            if target and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges
