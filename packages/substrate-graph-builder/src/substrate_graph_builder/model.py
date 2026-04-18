"""Core data types + file-type classifier for substrate-graph-builder.

Emission targets substrate_common.schema.NodeAffected / EdgeAffected so the
graph writer in services/ingestion consumes this library's output without
conversion at the boundary.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from substrate_common.errors import SubstrateError
from substrate_common.schema import EdgeAffected, NodeAffected

SymbolKind = Literal["function", "class", "method"]


@dataclass(frozen=True)
class Symbol:
    """A top-level definition inside a source file."""
    name: str
    kind: SymbolKind
    line: int  # 1-indexed


@dataclass
class FileAnalysis:
    """Per-file output of a plugin's `parse()`."""
    imports: list[str] = field(default_factory=list)       # raw, plugin's vocabulary
    symbols: list[Symbol] = field(default_factory=list)


@dataclass
class RepoContext:
    """One-shot pre-scan results shared across all plugins for a single
    build_graph() invocation. Plugins read whichever fields they need."""
    root_dir: str
    source_name: str = "github"
    go_module: str | None = None
    ts_path_aliases: dict[str, list[str]] = field(default_factory=dict)
    php_psr4: dict[str, list[str]] = field(default_factory=dict)
    csharp_namespace_index: dict[str, list[str]] = field(default_factory=dict)

    @classmethod
    def from_root(cls, root_dir: str, source_name: str = "github") -> RepoContext:
        """Walk the repo once; gather config files that plugins depend on."""
        from substrate_graph_builder._scan import (
            build_csharp_namespace_index,
            read_composer_psr4,
            read_go_module,
            read_tsconfig_paths,
        )
        return cls(
            root_dir=root_dir,
            source_name=source_name,
            go_module=read_go_module(root_dir),
            ts_path_aliases=read_tsconfig_paths(root_dir),
            php_psr4=read_composer_psr4(root_dir),
            csharp_namespace_index=build_csharp_namespace_index(root_dir),
        )


@dataclass
class GraphDocument:
    """Everything build_graph emits for a single repo/tree."""
    nodes: list[NodeAffected] = field(default_factory=list)
    edges: list[EdgeAffected] = field(default_factory=list)


# ---- file-type classifier (moved from services/ingestion/src/connectors/github.py) ----

_EXT_TO_TYPE: dict[str, str] = {
    # Source code
    ".c": "source", ".h": "source", ".cpp": "source", ".hpp": "source", ".cc": "source",
    ".py": "source", ".go": "source", ".rs": "source",
    ".ts": "source", ".tsx": "source", ".js": "source", ".jsx": "source",
    ".pl": "source", ".pm": "source",
    ".java": "source", ".kt": "source", ".kts": "source", ".swift": "source", ".cs": "source",
    ".rb": "source", ".php": "source", ".lua": "source", ".zig": "source",
    ".m4": "source",
    # Config / build
    ".cmake": "config", ".toml": "config", ".yaml": "config", ".yml": "config",
    ".json": "config", ".xml": "config", ".ini": "config", ".cfg": "config",
    ".conf": "config", ".env": "config", ".properties": "config",
    # Scripts / automation
    ".sh": "script", ".bash": "script", ".zsh": "script", ".bat": "script",
    ".ps1": "script", ".fish": "script",
    # Documentation
    ".md": "doc", ".rst": "doc", ".txt": "doc", ".adoc": "doc",
    ".html": "doc", ".htm": "doc",
    # Data / assets
    ".csv": "data", ".tsv": "data", ".sql": "data",
    ".png": "asset", ".jpg": "asset", ".jpeg": "asset", ".gif": "asset",
    ".svg": "asset", ".ico": "asset", ".woff": "asset", ".woff2": "asset",
}

_NAME_TO_TYPE: dict[str, str] = {
    "Makefile": "config", "Dockerfile": "config", "Vagrantfile": "config",
    "CMakeLists.txt": "config", "Rakefile": "config", "Gemfile": "config",
    ".gitignore": "config", ".gitattributes": "config", ".editorconfig": "config",
    "LICENSE": "doc", "COPYING": "doc", "README": "doc", "CHANGELOG": "doc",
}


def classify_file_type(path: str) -> str:
    """Classify a repo-relative file path into a semantic node type.

    Types flow through the ingestion pipeline into AGE → read API → frontend
    theme; changing a value here is a breaking change to the graph schema.
    """
    name = path.rsplit("/", 1)[-1]
    if name in _NAME_TO_TYPE:
        return _NAME_TO_TYPE[name]
    base = name.split(".")[0]
    if base in _NAME_TO_TYPE:
        return _NAME_TO_TYPE[base]
    ext = ""
    if "." in name:
        ext = "." + name.rsplit(".", 1)[-1].lower()
    return _EXT_TO_TYPE.get(ext, "service")


# ---- errors ----

class PluginNotFoundError(SubstrateError):
    """Raised when a path has no registered plugin but the caller expected one.
    Indicates a classification bug in the orchestrator — user-visible only if
    it escapes up the HTTP stack, which it should not."""
    code = "PLUGIN_NOT_FOUND"
    status = 500


class ParseTreeError(SubstrateError):
    """Raised when tree-sitter fails to produce any parse tree for a file.
    Caught and logged inside build_graph — never re-raised out."""
    code = "PARSE_TREE_ERROR"
    status = 500
