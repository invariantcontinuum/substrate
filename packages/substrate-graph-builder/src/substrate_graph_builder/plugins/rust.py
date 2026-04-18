"""Rust plugin.

Imports:
  - `use a::b::c;` / `use a::{b, c};` / `use crate::x::y;` / `pub use ...;`
  - `mod foo;` (declaration pulls in `foo.rs` or `foo/mod.rs` relative to caller)

Resolver:
  - `mod foo` -> try `{caller_dir}/foo.rs`, then `{caller_dir}/foo/mod.rs`.
  - `use a::b::c` -> try `{caller_dir}/a/b/c.rs`, `a/b/c.rs`, `a/b/c/mod.rs`.
  - `crate::` prefix maps to `src/` in a Cargo project (best-effort).
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class RustPlugin(TreeSitterPlugin):
    language = "rust"
    grammar_name = "rust"
    extensions = frozenset({".rs"})

    imports_query = """
    (use_declaration argument: (scoped_identifier) @import.path)
    (use_declaration argument: (identifier) @import.path)
    (use_declaration argument: (scoped_use_list path: (scoped_identifier) @import.path))
    (mod_item name: (identifier) @import.mod)
    """

    symbols_query = """
    (source_file (function_item name: (identifier) @symbol.function))
    (source_file (struct_item name: (type_identifier) @symbol.class))
    (source_file (enum_item name: (type_identifier) @symbol.class))
    (source_file (trait_item name: (type_identifier) @symbol.class))
    (source_file (impl_item
      body: (declaration_list
        (function_item name: (identifier) @symbol.method))))
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
            if "::" in raw:
                target = _resolve_rust_use(raw, src_dir, known_files)
            else:
                # `mod foo` form (captured from @import.mod)
                target = _resolve_rust_mod(raw, src_dir, known_files)
            if target and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path, target_id=target,
                    type="depends", action="add",
                ))
        return edges


def _resolve_rust_use(path: str, src_dir: str, known_files: set[str]) -> str | None:
    parts = path.split("::")
    if parts and parts[0] in ("crate", "self", "super"):
        parts = parts[1:]
    if not parts:
        return None
    rel = "/".join(parts)
    candidates = [
        f"{src_dir}/{rel}.rs",
        f"{src_dir}/{rel}/mod.rs",
        f"{rel}.rs",
        f"{rel}/mod.rs",
        f"src/{rel}.rs",
        f"src/{rel}/mod.rs",
    ]
    for c in candidates:
        c = c.lstrip("/")
        if c in known_files:
            return c
    # try with the last segment dropped (for `use a::b::{c, d}` edge captures)
    if len(parts) > 1:
        return _resolve_rust_use("::".join(parts[:-1]), src_dir, known_files)
    return None


def _resolve_rust_mod(name: str, src_dir: str, known_files: set[str]) -> str | None:
    candidates = [f"{src_dir}/{name}.rs", f"{src_dir}/{name}/mod.rs"]
    for c in candidates:
        c = c.lstrip("/")
        if c in known_files:
            return c
    return None
