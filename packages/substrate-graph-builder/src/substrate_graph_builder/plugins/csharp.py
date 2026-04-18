"""C# plugin.

`using X.Y.Z;` resolves by namespace, not by path — because C# files can
declare any namespace anywhere. `RepoContext.csharp_namespace_index` is
pre-populated in `_scan.build_csharp_namespace_index` with
`{ns_fqn: [file_path, ...]}`; the resolver looks up that key.

Symbols: class / struct / interface / record / enum -> class;
methods inside the body -> method. The plan's symbols_query covered
class/struct/interface inside namespaces but omitted record/enum; this
plugin adds the missing two so the docstring claim holds.
"""

from __future__ import annotations

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class CSharpPlugin(TreeSitterPlugin):
    language = "csharp"
    grammar_name = "csharp"
    extensions = frozenset({".cs"})

    imports_query = """
    (using_directive (qualified_name) @import.path)
    (using_directive (identifier) @import.path)
    """

    symbols_query = """
    (compilation_unit (class_declaration name: (identifier) @symbol.class))
    (compilation_unit (struct_declaration name: (identifier) @symbol.class))
    (compilation_unit (interface_declaration name: (identifier) @symbol.class))
    (compilation_unit (record_declaration name: (identifier) @symbol.class))
    (compilation_unit (enum_declaration name: (identifier) @symbol.class))
    (namespace_declaration
      body: (declaration_list
        (class_declaration name: (identifier) @symbol.class)))
    (namespace_declaration
      body: (declaration_list
        (struct_declaration name: (identifier) @symbol.class)))
    (namespace_declaration
      body: (declaration_list
        (interface_declaration name: (identifier) @symbol.class)))
    (namespace_declaration
      body: (declaration_list
        (record_declaration name: (identifier) @symbol.class)))
    (namespace_declaration
      body: (declaration_list
        (enum_declaration name: (identifier) @symbol.class)))
    (declaration_list (method_declaration name: (identifier) @symbol.method))
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
            raw = raw.strip()
            # Skip System.* and Microsoft.* stdlib prefixes
            if raw.startswith(("System", "Microsoft")):
                continue
            targets = ctx.csharp_namespace_index.get(raw, [])
            for t in targets:
                if t != source_path and t not in seen:
                    seen.add(t)
                    edges.append(EdgeAffected(
                        source_id=source_path, target_id=t,
                        type="depends", action="add",
                    ))
        return edges
