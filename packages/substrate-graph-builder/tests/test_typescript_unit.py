"""TypeScript plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.typescript import TypeScriptPlugin


def _ctx(tmp_path: Path, aliases: dict[str, list[str]] | None = None) -> RepoContext:
    return RepoContext(
        root_dir=str(tmp_path), source_name="github",
        ts_path_aliases=aliases or {},
    )


def test_parse_imports(tmp_path: Path) -> None:
    p = TypeScriptPlugin()
    src = 'import x from "./a";\nimport type {Y} from "./b";\n'
    r = p.parse("f.ts", src, _ctx(tmp_path))
    assert set(r.imports) == {"./a", "./b"}


def test_parse_tsx_imports(tmp_path: Path) -> None:
    p = TypeScriptPlugin()
    src = 'import React from "react";\nimport x from "./y";\n'
    r = p.parse("App.tsx", src, _ctx(tmp_path))
    assert "./y" in r.imports


def test_parse_symbols_interface_counts_as_class(tmp_path: Path) -> None:
    p = TypeScriptPlugin()
    src = (
        "export function foo(): number { return 1; }\n"
        "export class Bar { method() {} }\n"
        "export interface Baz { id: string; }\n"
    )
    r = p.parse("f.ts", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("foo", "function") in names
    assert ("Bar", "class") in names
    assert ("Baz", "class") in names
    assert ("method", "method") in names


def test_resolve_tsconfig_alias(tmp_path: Path) -> None:
    p = TypeScriptPlugin()
    ctx = _ctx(tmp_path, aliases={"@": ["src"]})
    analysis = p.parse("src/app.ts", 'import x from "@/components/Button";\n', ctx)
    known = {"src/app.ts", "src/components/Button.tsx"}
    edges = p.resolve("src/app.ts", analysis, known, ctx)
    assert any(e.target_id == "src/components/Button.tsx" for e in edges)


def test_resolve_relative_tsx(tmp_path: Path) -> None:
    p = TypeScriptPlugin()
    ctx = _ctx(tmp_path)
    analysis = p.parse("src/app.ts", 'import B from "./Button";\n', ctx)
    known = {"src/app.ts", "src/Button.tsx"}
    edges = p.resolve("src/app.ts", analysis, known, ctx)
    assert any(e.target_id == "src/Button.tsx" for e in edges)
