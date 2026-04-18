"""Python language plugin.

Imports captured:
  - `import a.b.c`         → "a.b.c"
  - `import a.b.c as x`    → "a.b.c"
  - `from a.b import c`    → "a.b"
  - `from .x import y`     → ".x"   (relative import; leading dots preserved)
  - `from ..x.y import z`  → "..x.y"

Symbols captured:
  - top-level `def` / `async def` → function
  - top-level `class` → class
  - methods: `def` directly inside a class body → method

Resolver rules:
  - Dotted absolute imports → try `a/b/c.py`, `a/b/c/__init__.py`, and `a/b.py`
    (if import was `from a.b import c`).
  - Relative imports (leading dots) → walk up N levels from source dir, then try the same.
  - `__init__.py` makes a directory a package root for relative walks.
"""

from __future__ import annotations

import os

from substrate_common.schema import EdgeAffected

from substrate_graph_builder.model import FileAnalysis, RepoContext
from substrate_graph_builder.plugins._base import TreeSitterPlugin


class PythonPlugin(TreeSitterPlugin):
    language = "python"
    grammar_name = "python"
    extensions = frozenset({".py", ".pyi"})

    imports_query = """
    (import_statement
      name: (dotted_name) @import.module)
    (import_statement
      name: (aliased_import
        name: (dotted_name) @import.module))
    (import_from_statement
      module_name: (dotted_name) @import.module)
    (import_from_statement
      module_name: (relative_import) @import.module)
    """

    symbols_query = """
    (module (function_definition name: (identifier) @symbol.function))
    (module (decorated_definition
      definition: (function_definition name: (identifier) @symbol.function)))
    (module (class_definition name: (identifier) @symbol.class))
    (module (decorated_definition
      definition: (class_definition name: (identifier) @symbol.class)))
    (class_definition
      body: (block
        (function_definition name: (identifier) @symbol.method)))
    (class_definition
      body: (block
        (decorated_definition
          definition: (function_definition name: (identifier) @symbol.method))))
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
            target = _resolve_python(raw, src_dir, known_files)
            if target and target != source_path and target not in seen:
                seen.add(target)
                edges.append(EdgeAffected(
                    source_id=source_path,
                    target_id=target,
                    type="depends",
                    action="add",
                ))
        return edges


def _resolve_python(raw: str, src_dir: str, known_files: set[str]) -> str | None:
    """Resolve a raw Python import (dotted or relative) to a known file path.

    Returns None if no candidate exists in known_files.
    """
    # Count leading dots for relative imports.
    dots = 0
    while dots < len(raw) and raw[dots] == ".":
        dots += 1
    remainder = raw[dots:]

    if dots > 0:
        # relative: walk up (dots - 1) directories from src_dir
        base = src_dir
        for _ in range(dots - 1):
            base = os.path.dirname(base)
        candidates = _dotted_candidates(remainder, base)
    else:
        # absolute: try from the same dir (intra-package) AND from repo root
        candidates = list(_dotted_candidates(remainder, src_dir))
        candidates.extend(_dotted_candidates(remainder, ""))

    for cand in candidates:
        clean = cand.lstrip("./").replace("\\", "/")
        if clean in known_files:
            return clean
    return None


def _dotted_candidates(dotted: str, base_dir: str) -> list[str]:
    """For `a.b.c` under base: [base/a/b/c.py, base/a/b/c/__init__.py, base/a/b.py
    (for `from a.b import c`)]."""
    if not dotted:
        return []
    as_path = dotted.replace(".", "/")
    out: list[str] = []
    prefix = f"{base_dir}/" if base_dir else ""
    out.append(f"{prefix}{as_path}.py")
    out.append(f"{prefix}{as_path}/__init__.py")
    if "/" in as_path:
        parent = as_path.rsplit("/", 1)[0]
        out.append(f"{prefix}{parent}.py")
        out.append(f"{prefix}{parent}/__init__.py")
    return out
