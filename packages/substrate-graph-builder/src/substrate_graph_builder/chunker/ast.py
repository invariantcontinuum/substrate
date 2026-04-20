"""Generic tree-sitter AST chunker.

Walks the top-level named children of the parsed tree, emitting one
chunk per construct. Oversized constructs recurse into their named
children; anything still oversized at leaf level falls through to a
line-greedy split within the node's byte range.

Tiny adjacent siblings are merged greedily up to the budget so we don't
pay embedding cost on 3-line helpers.

Language-specific nuance is intentionally absent — tree-sitter grammars
already expose the right top-level constructs for each language
(function_definition / class_definition / function_declaration /
impl_item / etc.), so we just respect the tree's own structure.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from substrate_graph_builder.chunker.fallback import chunk_lines
from substrate_graph_builder.chunker.tokens import estimate_tokens
from substrate_graph_builder.chunker.types import Chunk

if TYPE_CHECKING:
    from tree_sitter import Node, Parser

# Node types whose name we propagate into Chunk.chunk_type + symbols.
# Kept coarse on purpose — the common denominator across tree-sitter
# grammars. Anything not listed gets chunk_type="block".
_CONSTRUCT_TYPES = {
    "function_definition", "function_declaration", "function_item",
    "method_definition", "method_declaration",
    "class_definition", "class_declaration",
    "interface_declaration",
    "struct_item", "struct_declaration", "struct_specifier",
    "enum_item", "enum_declaration", "enum_specifier",
    "impl_item", "trait_item",
    "module", "namespace_definition", "namespace_declaration",
    "decorated_definition",
}


def _construct_kind(node_type: str) -> str:
    for keyword in ("function", "method", "class", "interface", "struct",
                    "enum", "impl", "trait", "module", "namespace"):
        if keyword in node_type:
            return keyword
    return "block"


def _node_name(node: Node, source: bytes) -> str | None:
    """Best-effort identifier extraction. Works on ~all tree-sitter
    grammars that expose a `name` field on named constructs."""
    named = node.child_by_field_name("name")
    if named is not None:
        return source[named.start_byte:named.end_byte].decode("utf-8", errors="replace")
    # Fallback: first identifier child.
    for child in node.children:
        if child.type == "identifier":
            return source[child.start_byte:child.end_byte].decode("utf-8", errors="replace")
    return None


def _node_text(node: Node, source: bytes) -> str:
    return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")


def _line_range(node: Node) -> tuple[int, int]:
    return node.start_point[0] + 1, node.end_point[0] + 1


def _walk(node: Node, source: bytes, budget: int, acc: list[Chunk]) -> None:
    """Recursive collector. Emits chunks for `node`; recurses if oversized."""
    text = _node_text(node, source)
    tokens = estimate_tokens(text)
    named_children = [c for c in node.children if c.is_named]

    if tokens <= budget or not named_children:
        # Terminal for our purposes: emit this node as a single chunk.
        # If it *is* still oversized and has no children, split by lines.
        if tokens > budget:
            start_line = node.start_point[0] + 1
            for sub in chunk_lines(text, budget=budget, overlap=0):
                acc.append(Chunk(
                    content=sub.content,
                    start_line=start_line + sub.start_line - 1,
                    end_line=start_line + sub.end_line - 1,
                    token_count=sub.token_count,
                    chunk_type=_construct_kind(node.type),
                    symbols=[n] if (n := _node_name(node, source)) else [],
                ))
            return
        start_line, end_line = _line_range(node)
        symbols: list[str] = []
        if node.type in _CONSTRUCT_TYPES:
            if (name := _node_name(node, source)):
                symbols = [name]
        acc.append(Chunk(
            content=text,
            start_line=start_line,
            end_line=end_line,
            token_count=tokens,
            chunk_type=_construct_kind(node.type) if node.type in _CONSTRUCT_TYPES else "block",
            symbols=symbols,
        ))
        return

    for child in named_children:
        _walk(child, source, budget, acc)


def _merge_type(a: str, b: str) -> str | None:
    """Return the merged chunk_type, or None if merging would lose
    distinct construct identity."""
    if a == b:
        return a
    if a == "block":
        return b
    if b == "block":
        return a
    # Two distinct non-block constructs (e.g. function + class) — keep separate.
    return None


def _merge_small_adjacent(chunks: list[Chunk], budget: int) -> list[Chunk]:
    """Combine neighboring chunks up to the budget, but don't merge two
    distinct non-block constructs (e.g. function + class) — the
    chunk_type carries retrieval-relevant information and blending it
    would lose it."""
    if not chunks:
        return chunks
    merged: list[Chunk] = [chunks[0]]
    for nxt in chunks[1:]:
        prev = merged[-1]
        combined_tokens = prev.token_count + nxt.token_count
        merged_type = _merge_type(prev.chunk_type, nxt.chunk_type)
        if (
            merged_type is not None
            and combined_tokens <= budget
            and nxt.start_line <= prev.end_line + 2
        ):
            merged[-1] = Chunk(
                content=f"{prev.content}\n{nxt.content}",
                start_line=prev.start_line,
                end_line=max(prev.end_line, nxt.end_line),
                token_count=combined_tokens,
                chunk_type=merged_type,
                symbols=prev.symbols + nxt.symbols,
            )
        else:
            merged.append(nxt)
    return merged


def chunk_ast(
    parser: "Parser",
    content: str,
    budget: int,
) -> list[Chunk]:
    """Parse `content` with the provided tree-sitter Parser and return
    AST-aligned chunks. Caller is responsible for post-processing
    (language, chunk_index, breadcrumbs)."""
    source = content.encode("utf-8", errors="replace")
    tree = parser.parse(source)
    root = tree.root_node
    raw: list[Chunk] = []
    for child in root.children:
        if not child.is_named:
            continue
        _walk(child, source, budget, raw)
    return _merge_small_adjacent(raw, budget)
