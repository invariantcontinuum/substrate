"""C# plugin unit tests — parse + resolve on handcrafted snippets."""

from __future__ import annotations

from pathlib import Path

from substrate_graph_builder.model import RepoContext
from substrate_graph_builder.plugins.csharp import CSharpPlugin


def _ctx(tmp_path: Path, index: dict[str, list[str]] | None = None) -> RepoContext:
    return RepoContext(
        root_dir=str(tmp_path), source_name="github",
        csharp_namespace_index=index or {},
    )


def test_parse_using(tmp_path: Path) -> None:
    p = CSharpPlugin()
    src = (
        "using System;\n"
        "using Acme.Util;\n"
        "namespace Acme {\n"
        "  class App {}\n"
        "}\n"
    )
    r = p.parse("App.cs", src, _ctx(tmp_path))
    assert "System" in r.imports
    assert "Acme.Util" in r.imports


def test_parse_symbols(tmp_path: Path) -> None:
    p = CSharpPlugin()
    src = (
        "namespace Acme {\n"
        "  public class Foo {\n"
        "    public int Bar() { return 1; }\n"
        "  }\n"
        "  public interface IQux {}\n"
        "  public struct Point {}\n"
        "  public record Person(string name);\n"
        "  public enum Color { Red, Green }\n"
        "}\n"
    )
    r = p.parse("App.cs", src, _ctx(tmp_path))
    names = {(s.name, s.kind) for s in r.symbols}
    assert ("Foo", "class") in names
    assert ("IQux", "class") in names
    assert ("Point", "class") in names
    assert ("Bar", "method") in names


def test_resolve_via_namespace_index(tmp_path: Path) -> None:
    p = CSharpPlugin()
    ctx = _ctx(tmp_path, index={"Acme.Util": ["src/Util/Helper.cs"]})
    analysis = p.parse("App.cs", "using Acme.Util;\n", ctx)
    edges = p.resolve("App.cs", analysis, {"App.cs", "src/Util/Helper.cs"}, ctx)
    assert any(e.target_id == "src/Util/Helper.cs" for e in edges)


def test_resolve_system_drops(tmp_path: Path) -> None:
    p = CSharpPlugin()
    ctx = _ctx(tmp_path)
    analysis = p.parse("App.cs", "using System.Collections.Generic;\n", ctx)
    edges = p.resolve("App.cs", analysis, {"App.cs"}, ctx)
    assert edges == []
