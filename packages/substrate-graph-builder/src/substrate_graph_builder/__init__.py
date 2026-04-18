"""Public API for substrate-graph-builder.

Consumers import `build_graph` + `REGISTRY`; everything else is internal.
"""

from substrate_graph_builder.builder import build_graph
from substrate_graph_builder.model import (
    FileAnalysis,
    GraphDocument,
    ParseTreeError,
    PluginNotFoundError,
    RepoContext,
    Symbol,
    classify_file_type,
)
from substrate_graph_builder.plugins import REGISTRY
from substrate_graph_builder.plugins._base import LanguagePlugin, TreeSitterPlugin

__all__ = [
    "REGISTRY",
    "FileAnalysis",
    "GraphDocument",
    "LanguagePlugin",
    "ParseTreeError",
    "PluginNotFoundError",
    "RepoContext",
    "Symbol",
    "TreeSitterPlugin",
    "build_graph",
    "classify_file_type",
]
