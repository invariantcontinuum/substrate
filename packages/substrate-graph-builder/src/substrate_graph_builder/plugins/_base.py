"""LanguagePlugin Protocol + TreeSitterPlugin base class.

Every concrete plugin extends TreeSitterPlugin, declaring:
  - `language`, `grammar_name`, `extensions`, `filenames`
  - `imports_query`: tree-sitter query capturing @import.path (string of the raw import)
  - `symbols_query`: tree-sitter query capturing @symbol.function / @symbol.class /
    @symbol.method (identifier node of the definition)

and overriding `resolve()` with the language's import-to-file rules.
"""

from __future__ import annotations

from typing import Protocol

import structlog
from substrate_common.schema import EdgeAffected
from tree_sitter import Language, Node, Parser, Query, QueryCursor

from substrate_graph_builder.model import FileAnalysis, RepoContext, Symbol, SymbolKind

logger = structlog.get_logger()


class LanguagePlugin(Protocol):
    """Minimum contract the registry and orchestrator rely on."""
    language: str
    extensions: frozenset[str]
    filenames: frozenset[str]

    def parse(self, path: str, content: str, ctx: RepoContext) -> FileAnalysis: ...

    def resolve(
        self,
        source_path: str,
        analysis: FileAnalysis,
        known_files: set[str],
        ctx: RepoContext,
    ) -> list[EdgeAffected]: ...


_SYMBOL_PREFIX = "symbol."
_IMPORT_PREFIX = "import."


class TreeSitterPlugin:
    """Shared implementation of `parse()` via tree-sitter queries.

    Subclasses set class-level attributes; the base loads the grammar lazily
    once per-process and compiles the queries on first use.
    """

    language: str                         # user-facing key, e.g. "python"
    grammar_name: str                     # tree-sitter-language-pack key
    extensions: frozenset[str]
    filenames: frozenset[str] = frozenset()

    imports_query: str = ""               # captures with names starting "import."
    symbols_query: str = ""               # captures with names starting "symbol."

    _language: Language | None = None
    _parser: Parser | None = None
    _imports_q: Query | None = None
    _symbols_q: Query | None = None

    def _ensure_loaded(self) -> None:
        if self._language is not None:
            return
        from tree_sitter_language_pack import get_language, get_parser
        # grammar_name is validated per-plugin; pack's Literal[...] is too narrow for a base class
        self._language = get_language(self.grammar_name)  # type: ignore[arg-type]
        self._parser = get_parser(self.grammar_name)  # type: ignore[arg-type]
        self._imports_q = (
            self._language.query(self.imports_query) if self.imports_query else None
        )
        self._symbols_q = (
            self._language.query(self.symbols_query) if self.symbols_query else None
        )

    def parse(self, path: str, content: str, ctx: RepoContext) -> FileAnalysis:
        self._ensure_loaded()
        assert self._parser is not None
        tree = self._parser.parse(content.encode("utf-8"))
        if tree.root_node.has_error:
            # partial parse — keep going; captures on valid subtrees still work
            logger.warning(
                "parse_partial",
                path=path,
                language=self.language,
            )

        imports = self._collect_imports(tree.root_node, content)
        symbols = self._collect_symbols(tree.root_node, content)
        return FileAnalysis(imports=imports, symbols=symbols)

    def _collect_imports(self, root: Node, content: str) -> list[str]:
        if self._imports_q is None:
            return []
        out: list[str] = []
        # tree-sitter 0.25+: captures() lives on QueryCursor; shape is dict[str, list[Node]]
        captures = QueryCursor(self._imports_q).captures(root)
        for name, nodes in captures.items():
            if not name.startswith(_IMPORT_PREFIX):
                continue
            for node in nodes:
                raw = content[node.start_byte:node.end_byte].strip().strip('"\'`')
                if raw:
                    out.append(raw)
        return out

    def _collect_symbols(self, root: Node, content: str) -> list[Symbol]:
        if self._symbols_q is None:
            return []
        out: list[Symbol] = []
        captures = QueryCursor(self._symbols_q).captures(root)
        for name, nodes in captures.items():
            if not name.startswith(_SYMBOL_PREFIX):
                continue
            kind_str = name[len(_SYMBOL_PREFIX):]
            if kind_str not in ("function", "class", "method"):
                continue
            kind: SymbolKind = kind_str  # type: ignore[assignment]
            for node in nodes:
                sym_name = content[node.start_byte:node.end_byte]
                out.append(Symbol(
                    name=sym_name,
                    kind=kind,
                    line=node.start_point[0] + 1,
                ))
        return out

    def resolve(
        self,
        source_path: str,
        analysis: FileAnalysis,
        known_files: set[str],
        ctx: RepoContext,
    ) -> list[EdgeAffected]:
        raise NotImplementedError(
            f"{type(self).__name__} must implement resolve()"
        )
