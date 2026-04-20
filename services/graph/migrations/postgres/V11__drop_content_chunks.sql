-- V11: drop existing chunks so the new AST/semantic chunker (substrate-
-- graph-builder.chunker) repopulates content_chunks on the next sync.
--
-- Line-based chunks produced by the old greedy chunker are incompatible
-- with the new breadcrumb-prefixed, AST-aligned chunks: their start_line
-- / end_line / chunk_type semantics differ, and the embeddings were
-- generated against the old content strings. Wipe and let the next
-- sync run rebuild.

DELETE FROM content_chunks;
