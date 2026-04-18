"""Java plugin.

Imports: `import com.acme.Foo;` -> "com.acme.Foo". Wildcard imports
`import com.acme.*` are captured but resolved to any `com/acme/*.java` file.
Stdlib prefixes `java.`, `javax.` are dropped in the resolver.

Symbols: top-level class/interface/enum/record -> class; methods inside
class bodies -> method.
"""

from __future__ import annotations

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class JavaPlugin(TreeSitterPlugin):
    language = "java"
    grammar_name = "java"
    extensions = frozenset({".java"})

    imports_query = """
    (import_declaration (scoped_identifier) @import.path)
    (import_declaration (identifier) @import.path)
    """

    symbols_query = """
    (program (class_declaration name: (identifier) @symbol.class))
    (program (interface_declaration name: (identifier) @symbol.class))
    (program (enum_declaration name: (identifier) @symbol.class))
    (program (record_declaration name: (identifier) @symbol.class))
    (class_body (method_declaration name: (identifier) @symbol.method))
    (interface_body (method_declaration name: (identifier) @symbol.method))
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
            if raw.startswith(("java.", "javax.")):
                continue
            # strip trailing `.*` wildcard
            is_wildcard = raw.endswith(".*")
            stem = raw[:-2] if is_wildcard else raw
            if is_wildcard:
                prefix = stem.replace(".", "/") + "/"
                for f in known_files:
                    if (
                        f.startswith(prefix)
                        and f.endswith(".java")
                        and "/" not in f[len(prefix):]
                    ):
                        if f != source_path and f not in seen:
                            seen.add(f)
                            edges.append(EdgeAffected(
                                source_id=source_path, target_id=f,
                                type="depends", action="add",
                            ))
                continue
            # Fully qualified class name -> `com/acme/Foo.java`
            target = stem.replace(".", "/") + ".java"
            if target in known_files and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges
