import pytest
from src.connectors.github import parse_repo_tree, parse_c_includes
from src.schema import NodeAffected, EdgeAffected


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
        assert "src/main.c" in names
        assert "lib/transfer.c" in names
        assert "lib/transfer.h" in names
        assert "README.md" not in names
        assert "src" not in names

    def test_assigns_correct_node_types(self):
        tree = [
            {"path": "src/main.c", "type": "blob"},
            {"path": "lib/url.c", "type": "blob"},
        ]
        nodes = parse_repo_tree(tree, source="github")
        for node in nodes:
            assert node.type == "service"
            assert node.action == "add"
            assert node.meta.get("source") == "github"


class TestParseCIncludes:
    def test_extracts_include_edges(self):
        file_id = "lib/transfer.c"
        content = '''#include "url.h"
#include "connect.h"
#include <stdlib.h>
#include "http.h"
'''
        edges = parse_c_includes(file_id, content, known_files={"lib/url.h", "lib/connect.h", "lib/http.h"})
        targets = [e.target_id for e in edges]
        assert "lib/url.h" in targets
        assert "lib/connect.h" in targets
        assert "lib/http.h" in targets
        assert len(edges) == 3

    def test_no_includes_returns_empty(self):
        edges = parse_c_includes("main.c", "int main() { return 0; }", known_files=set())
        assert edges == []

    def test_creates_depends_edges(self):
        edges = parse_c_includes("a.c", '#include "b.h"\n', known_files={"b.h"})
        assert edges[0].type == "depends"
        assert edges[0].source_id == "a.c"
        assert edges[0].target_id == "b.h"
        assert edges[0].action == "add"
