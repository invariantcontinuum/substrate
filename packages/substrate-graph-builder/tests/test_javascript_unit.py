"""JavaScript plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.javascript import JavaScriptPlugin


def _ctx(tmp_path: Path) -> RepoContext:
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_parse_es6_import(tmp_path: Path) -> None:
    p = JavaScriptPlugin()
    src = 'import x from "./y";\nimport {a} from "./b";\nexport * from "./c";\n'
    r = p.parse("f.js", src, _ctx(tmp_path))
    assert set(r.imports) == {"./y", "./b", "./c"}


def test_parse_require_and_dynamic_import(tmp_path: Path) -> None:
    p = JavaScriptPlugin()
    src = 'const x = require("./lib/a");\nconst y = import("./lib/b");\n'
    r = p.parse("f.js", src, _ctx(tmp_path))
    assert "./lib/a" in r.imports
    assert "./lib/b" in r.imports


def test_parse_top_level_symbols(tmp_path: Path) -> None:
    p = JavaScriptPlugin()
    src = (
        "function foo() {}\n"
        "class Bar { method() {} }\n"
        "export function baz() {}\n"
        "export class Qux {}\n"
    )
    r = p.parse("f.js", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("foo", "function") in names
    assert ("baz", "function") in names
    assert ("Bar", "class") in names
    assert ("Qux", "class") in names
    assert ("method", "method") in names


def test_resolve_relative_with_extension_speculation(tmp_path: Path) -> None:
    p = JavaScriptPlugin()
    analysis = p.parse("src/main.js", 'import x from "./lib/a";\n', _ctx(tmp_path))
    known = {"src/main.js", "src/lib/a.js"}
    edges = p.resolve("src/main.js", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "src/lib/a.js" for e in edges)


def test_resolve_directory_index(tmp_path: Path) -> None:
    p = JavaScriptPlugin()
    analysis = p.parse("src/main.js", 'import x from "./lib";\n', _ctx(tmp_path))
    known = {"src/main.js", "src/lib/index.js"}
    edges = p.resolve("src/main.js", analysis, known, _ctx(tmp_path))
    assert any(e.target_id == "src/lib/index.js" for e in edges)


def test_resolve_bare_module_skipped(tmp_path: Path) -> None:
    p = JavaScriptPlugin()
    analysis = p.parse("f.js", 'import x from "lodash";\n', _ctx(tmp_path))
    edges = p.resolve("f.js", analysis, {"f.js"}, _ctx(tmp_path))
    assert edges == []
