from src.connectors.github import parse_repo_tree, parse_imports


class TestParseRepoTree:
    def test_extracts_c_source_files_as_nodes(self):
        tree = [
            {"path": "src/main.c", "type": "blob"},
            {"path": "lib/transfer.c", "type": "blob"},
            {"path": "lib/transfer.h", "type": "blob"},
            {"path": "README.md", "type": "blob"},
            {"path": "src", "type": "tree"},
        ]
        nodes = parse_repo_tree(tree, source="github")
        names = [n.id for n in nodes]
        types = {n.id: n.type for n in nodes}
        assert "src/main.c" in names
        assert "lib/transfer.c" in names
        assert "lib/transfer.h" in names
        # README.md is now included as a `doc` node (parser treats every blob
        # as a node and classifies by extension; non-source files are no
        # longer dropped).
        assert "README.md" in names
        assert types["README.md"] == "doc"
        assert "src" not in names  # tree entries (directories) excluded

    def test_assigns_correct_node_types(self):
        tree = [
            {"path": "src/main.c", "type": "blob"},
            {"path": "lib/url.c", "type": "blob"},
        ]
        nodes = parse_repo_tree(tree, source="github")
        for node in nodes:
            assert node.type == "source"
            assert node.action == "add"
            assert node.meta.get("source") == "github"


class TestParseImports:
    def test_extracts_include_edges(self):
        file_id = "lib/transfer.c"
        content = '''#include "url.h"
#include "connect.h"
#include <stdlib.h>
#include "http.h"
'''
        edges = parse_imports(file_id, content, known_files={"lib/url.h", "lib/connect.h", "lib/http.h"})
        targets = [e.target_id for e in edges]
        assert "lib/url.h" in targets
        assert "lib/connect.h" in targets
        assert "lib/http.h" in targets
        assert len(edges) == 3

    def test_no_includes_returns_empty(self):
        edges = parse_imports("main.c", "int main() { return 0; }", known_files=set())
        assert edges == []

    def test_creates_depends_edges(self):
        edges = parse_imports("a.c", '#include "b.h"\n', known_files={"b.h"})
        assert edges[0].type == "depends"
        assert edges[0].source_id == "a.c"
        assert edges[0].target_id == "b.h"
        assert edges[0].action == "add"


class TestGoImports:
    def test_single_line_import(self):
        content = 'package foo\nimport "fmt"\n'
        edges = parse_imports("x.go", content, known_files={"fmt"})
        assert [e.target_id for e in edges] == ["fmt"]

    def test_grouped_imports(self):
        content = (
            "package foo\n"
            "import (\n"
            '    "fmt"\n'
            '    "net/http"\n'
            '    "os"\n'
            ")\n"
        )
        known = {"fmt", "net/http", "os"}
        edges = parse_imports("x.go", content, known_files=known)
        assert sorted(e.target_id for e in edges) == ["fmt", "net/http", "os"]

    def test_grouped_with_aliases_underscores_dots(self):
        content = (
            "import (\n"
            '    foo "github.com/bar/baz"\n'
            '    _ "side/effects"\n'
            '    . "dot/import"\n'
            ")\n"
        )
        known = {"github.com/bar/baz", "side/effects", "dot/import"}
        edges = parse_imports("x.go", content, known_files=known)
        assert sorted(e.target_id for e in edges) == [
            "dot/import", "github.com/bar/baz", "side/effects",
        ]

    def test_mixed_single_and_grouped(self):
        content = (
            'import "solo"\n'
            "\n"
            "import (\n"
            '    "a"\n'
            '    "b"\n'
            ")\n"
        )
        known = {"solo", "a", "b"}
        edges = parse_imports("x.go", content, known_files=known)
        assert sorted(e.target_id for e in edges) == ["a", "b", "solo"]

    def test_no_imports_returns_empty(self):
        edges = parse_imports("x.go", "package foo\n\nfunc main() {}\n", known_files=set())
        assert edges == []
