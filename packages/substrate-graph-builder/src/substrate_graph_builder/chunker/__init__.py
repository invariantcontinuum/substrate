"""Semantic + AST-aware chunker for file content.

Public API:
    from substrate_graph_builder.chunker import Chunk, chunk_content

Plugin dispatch:
    - Files matched by a graph-builder plugin → AST-aware (tree-sitter)
    - .md / .markdown / .mdx → heading-aware markdown chunker
    - .txt / .rst / .adoc → paragraph-aware plain-text chunker
    - everything else → line-greedy fallback
"""
from substrate_graph_builder.chunker.dispatch import chunk_content
from substrate_graph_builder.chunker.tokens import estimate_tokens
from substrate_graph_builder.chunker.types import Chunk

__all__ = ["Chunk", "chunk_content", "estimate_tokens"]
