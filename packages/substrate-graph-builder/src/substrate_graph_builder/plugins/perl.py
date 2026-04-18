"""Perl plugin.

Imports:
  - `use X::Y;` / `use X::Y qw(a b);`  -> "X::Y"
  - `require "foo.pl";`                -> "foo.pl"
  - `require X::Y;`                    -> "X::Y"

Resolver:
  - `X::Y` -> `X/Y.pm` (repo-relative or caller-relative `lib/X/Y.pm`).
  - Quoted requires -> relative to caller's directory.

Query note: the plan referenced `use_no_statement` / `require_statement`, but
tree-sitter-perl 0.25+ names them `use_statement` / (`expression_statement`
wrapping `require_expression`). Queries adjusted to match actual grammar.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class PerlPlugin(TreeSitterPlugin):
    language = "perl"
    grammar_name = "perl"
    extensions = frozenset({".pl", ".pm"})

    imports_query = """
    (use_statement module: (package) @import.path)
    (require_expression (bareword) @import.path)
    (require_expression (interpolated_string_literal (string_content) @import.path))
    """

    symbols_query = """
    (subroutine_declaration_statement
      name: (bareword) @symbol.function)
    (package_statement
      name: (package) @symbol.class)
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
            target = _resolve_perl(raw, src_dir, known_files)
            if target and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges


def _resolve_perl(raw: str, src_dir: str, known_files: set[str]) -> str | None:
    raw = raw.strip().strip('"\'')
    if "::" in raw:
        rel = raw.replace("::", "/") + ".pm"
        for candidate in (f"{src_dir}/{rel}", f"lib/{rel}", rel):
            candidate = candidate.lstrip("/")
            if candidate in known_files:
                return candidate
        return None
    # quoted require
    candidate = os.path.normpath(os.path.join(src_dir, raw)).replace("\\", "/")
    if candidate in known_files:
        return candidate
    if raw in known_files:
        return raw
    return None
