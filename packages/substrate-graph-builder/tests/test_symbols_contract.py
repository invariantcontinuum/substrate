"""Whole-registry sanity: every plugin's symbols_query must yield at least
one symbol on a minimally-structured input for that language. If a new plugin
is added without a real `symbols_query`, this test fails loudly.
"""

from __future__ import annotations

from substrate_graph_builder import REGISTRY
from substrate_graph_builder.model import RepoContext

# Minimal source snippets that should yield ≥1 symbol per language.
# Key = plugin.language.
CANNED: dict[str, tuple[str, str]] = {
    "python":     ("f.py",           "def top():\n    pass\n"),
    "javascript": ("f.js",           "function top() {}\n"),
    "typescript": ("f.ts",           "export function top(): void {}\n"),
    "go":         ("f.go",           "package x\nfunc Top() {}\n"),
    "rust":       ("f.rs",           "fn top() {}\n"),
    "c":          ("f.c",            "int top(void) { return 1; }\n"),
    "cpp":        ("f.cpp",          "int top() { return 1; }\n"),
    "perl":       ("f.pm",           "package M;\nsub top { }\n1;\n"),
    "shell":      ("f.sh",           "top() { echo x; }\n"),
    "cmake":      ("CMakeLists.txt", "function(top arg)\nendfunction()\n"),
    "java":       ("F.java",         "public class F {}\n"),
    "ruby":       ("f.rb",           "class F\nend\n"),
    "php":        ("f.php",          "<?php\nfunction top() {}\n"),
    "kotlin":     ("f.kt",           "fun top() {}\n"),
    "csharp":     ("F.cs",           "public class F {}\n"),
}


def _ctx(tmp_path):
    return RepoContext(root_dir=str(tmp_path), source_name="github")


def test_every_plugin_emits_at_least_one_symbol(tmp_path):
    covered: set[str] = set()
    missing: dict[str, str] = {}
    for plugin in REGISTRY.all():
        if plugin.language not in CANNED:
            missing[plugin.language] = "no canned snippet"
            continue
        path, content = CANNED[plugin.language]
        result = plugin.parse(path, content, _ctx(tmp_path))
        if not result.symbols:
            missing[plugin.language] = "no symbols from canned snippet"
        else:
            covered.add(plugin.language)
    assert not missing, f"plugins failing symbol-contract: {missing}"
    # Defense: ensure every registered plugin actually has a canned entry.
    registered = {p.language for p in REGISTRY.all()}
    assert covered == registered, f"mismatch: covered={covered} registered={registered}"


def test_registry_has_expected_languages():
    expected = {
        "python", "javascript", "typescript", "go", "rust",
        "c", "cpp", "perl", "shell", "cmake",
        "java", "ruby", "php", "kotlin", "csharp",
    }
    registered = {p.language for p in REGISTRY.all()}
    assert registered == expected, f"unexpected registry contents: {registered ^ expected}"


def test_registry_covers_all_required_extensions():
    required_extensions = {
        ".py", ".pyi",
        ".js", ".jsx", ".mjs", ".cjs",
        ".ts", ".tsx",
        ".go", ".rs",
        ".c", ".h", ".cpp", ".cxx", ".cc", ".hpp", ".hh",
        ".pl", ".pm",
        ".sh", ".bash", ".zsh",
        ".cmake",
        ".java", ".rb", ".php", ".kt", ".kts", ".cs",
    }
    for ext in required_extensions:
        plugin = REGISTRY.get_for_path(f"x{ext}")
        assert plugin is not None, f"no plugin for {ext}"
    # filenames
    assert REGISTRY.get_for_path("CMakeLists.txt") is not None
