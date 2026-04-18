"""Ruby plugin.

Imports:
  - `require "path"`             — best-effort: try `lib/<path>.rb`
  - `require_relative "path"`    — caller-relative
  - `load "path"`                — same rule as require
  - `autoload :Const, "path"`    — same rule as require

Symbols: top-level class/module -> class; `def` -> method. Note: `def self.*`
(singleton methods) are not captured — the grammar uses `singleton_method`,
which this plugin's symbols_query does not include. Accepted SP-2 gap.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class RubyPlugin(TreeSitterPlugin):
    language = "ruby"
    grammar_name = "ruby"
    extensions = frozenset({".rb"})

    imports_query = """
    (call
      method: (identifier) @_m
      arguments: (argument_list (string (string_content) @import.path))
      (#match? @_m "^(require|require_relative|load)$"))
    (call
      method: (identifier) @_m
      arguments: (argument_list (simple_symbol) (string (string_content) @import.path))
      (#eq? @_m "autoload"))
    """

    symbols_query = """
    (program (class name: (constant) @symbol.class))
    (program (module name: (constant) @symbol.class))
    (program (method name: (identifier) @symbol.function))
    (class body: (body_statement (method name: (identifier) @symbol.method)))
    (module body: (body_statement (method name: (identifier) @symbol.method)))
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
            raw = raw.strip()
            candidates: list[str] = []
            if raw.startswith("./") or raw.startswith("../"):
                # require_relative: caller-relative
                base = os.path.normpath(os.path.join(src_dir, raw))
                candidates.append(f"{base}.rb")
                candidates.append(base)
            else:
                # try caller-relative AND lib/ prefix AND bare
                candidates.extend([
                    os.path.normpath(os.path.join(src_dir, raw + ".rb")),
                    f"lib/{raw}.rb",
                    f"{raw}.rb",
                    raw,
                ])
            target: str | None = None
            for c in candidates:
                c = c.replace("\\", "/").lstrip("./")
                if c in known_files:
                    target = c
                    break
            if target and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges
