"""Go plugin.

Imports: `import "path"` (single) + `import ( "a"; "b" )` (grouped).
Tree-sitter's go grammar handles both natively via `import_spec` inside
`import_declaration`.

Resolver: an import path starting with `ctx.go_module + "/"` maps to the
directory of `.go` files under that subdirectory (Go package = single dir).
Stdlib imports (no leading module prefix) are dropped.
"""

from __future__ import annotations

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class GoPlugin(TreeSitterPlugin):
    language = "go"
    grammar_name = "go"
    extensions = frozenset({".go"})

    imports_query = """
    (import_declaration
      (import_spec path: (interpreted_string_literal) @import.path))
    (import_declaration
      (import_spec_list
        (import_spec path: (interpreted_string_literal) @import.path)))
    """

    symbols_query = """
    (source_file (function_declaration name: (identifier) @symbol.function))
    (source_file (method_declaration name: (field_identifier) @symbol.method))
    (source_file (type_declaration
      (type_spec name: (type_identifier) @symbol.class)))
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
        if not ctx.go_module:
            return edges
        prefix = ctx.go_module + "/"
        for raw in analysis.imports:
            if not raw.startswith(prefix):
                continue
            pkg_dir = raw[len(prefix):].rstrip("/")
            # Every .go file directly in that directory (no recursion).
            for f in known_files:
                if not f.endswith(".go"):
                    continue
                if not f.startswith(pkg_dir + "/"):
                    continue
                # Direct child only — no deeper slashes.
                if "/" in f[len(pkg_dir) + 1:]:
                    continue
                if f == source_path or f in seen:
                    continue
                seen.add(f)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=f,
                    type="depends", action="add",
                ))
        return edges
