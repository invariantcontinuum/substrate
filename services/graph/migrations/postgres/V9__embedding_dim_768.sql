-- V9: migrate embedding columns from vector(2560) to vector(768).
--
-- Reason: the active embeddings runtime changed from Qwen3-Embedding-4B
-- (2560-dim) to nomic-embed-text-v2-moe (768-dim). pgvector does not
-- allow shrinking a fixed-dimension column in place, so we DROP and re-ADD.
-- All existing embeddings are lost — 2560-dim vectors are not comparable
-- to the 768-dim outputs from the active model. The startup dim guard
-- (src.startup.check_embedding_dim) will fail-fast if this migration has
-- not run.
--
-- To repopulate: trigger a resync for each source from the Sources
-- settings UI.

ALTER TABLE file_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE file_embeddings ADD COLUMN embedding vector(768);

ALTER TABLE content_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE content_chunks ADD COLUMN embedding vector(768);
