-- V4: migrate embedding columns from vector(1024) to vector(768).
--
-- Reason: the active embedding model changed from Qwen3-Embedding-0.6B
-- (1024-dim) to nomic-embed-text-v2-moe (768-dim). pgvector does not
-- allow shrinking a fixed-dim column in place, so we DROP and re-ADD.
-- All existing embeddings are lost — they were produced by the old
-- model and are not comparable to the new ones anyway. The startup
-- dim guard (src.startup.check_embedding_dim) will fail-fast if this
-- migration has not run.
--
-- To repopulate: trigger a resync for each source from the
-- SourcesSettings UI.

ALTER TABLE file_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE file_embeddings ADD COLUMN embedding vector(768);

ALTER TABLE content_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE content_chunks ADD COLUMN embedding vector(768);
