"""TypeScript plugin.

Resolution extends JavaScript's with:
  - Extension speculation: `{.ts,.tsx,.d.ts,.js,.jsx,.mjs,.cjs}`.
  - tsconfig.json `compilerOptions.paths` aliases (populated into
    `RepoContext.ts_path_aliases` at build-graph start). Alias key `@/*`
    maps to target dir `src/*` (for example); we store the stripped `@` →
    `["src"]` and try each target prefix + remainder.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin
from substrate_graph_builder.plugins.javascript import _resolve_js_like, _try_candidates

_TS_EXT_CANDIDATES = (".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs")


class TypeScriptPlugin(TreeSitterPlugin):
    language = "typescript"
    grammar_name = "typescript"
    extensions = frozenset({".ts", ".tsx"})

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
    (program (class_declaration name: (type_identifier) @symbol.class))
    (program (export_statement
      declaration: (class_declaration name: (type_identifier) @symbol.class)))
    (program (interface_declaration name: (type_identifier) @symbol.class))
    (program (export_statement
      declaration: (interface_declaration name: (type_identifier) @symbol.class)))
    (class_body (method_definition name: (property_identifier) @symbol.method))
    """

    def parse(self, path: str, content: str, ctx: RepoContext) -> FileAnalysis:
        # swap grammar for .tsx
        if path.endswith(".tsx"):
            self.grammar_name = "tsx"
        else:
            self.grammar_name = "typescript"
        # force reload of parser if grammar changed since last call
        self._language = None
        self._parser = None
        self._imports_q = None
        self._symbols_q = None
        return super().parse(path, content, ctx)

    def resolve(
        self,
        source_path: str,
        analysis: FileAnalysis,
        known_files: set[str],
        ctx: RepoContext,
    ) -> list[EdgeAffected]:
        def alias_resolver(raw: str, src_dir: str, known: set[str]) -> str | None:
            return _resolve_tsconfig_alias(raw, known, ctx, _TS_EXT_CANDIDATES)

        return _resolve_js_like(
            source_path, analysis, known_files, ctx,
            ext_candidates=_TS_EXT_CANDIDATES,
            extra_candidates=alias_resolver,
        )


def _resolve_tsconfig_alias(
    raw: str,
    known_files: set[str],
    ctx: RepoContext,
    exts: tuple[str, ...],
) -> str | None:
    for key, targets in ctx.ts_path_aliases.items():
        if raw == key or raw.startswith(key + "/"):
            remainder = raw[len(key):].lstrip("/")
            for t in targets:
                base = os.path.normpath(os.path.join(t, remainder))
                hit = _try_candidates(base, known_files, exts)
                if hit:
                    return hit
    return None
