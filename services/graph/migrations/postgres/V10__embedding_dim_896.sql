-- V10: migrate embedding columns from vector(768) to vector(896).
--
-- Reason: the active embeddings runtime changed from nomic-embed-text-v2-moe
-- (768-dim) to jina-code-embeddings-0.5b (896-dim). pgvector does not
-- allow altering a fixed-dimension column in place, so we DROP and re-ADD.
-- All existing embeddings are lost — 768-dim vectors are not comparable
-- to the 896-dim outputs from the active model. The startup dim guard
-- (src.startup.check_embedding_dim) will fail-fast if this migration has
-- not run.
--
-- To repopulate: trigger a resync for each source from the Sources
-- settings UI.

ALTER TABLE file_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE file_embeddings ADD COLUMN embedding vector(896);

ALTER TABLE content_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE content_chunks ADD COLUMN embedding vector(896);
