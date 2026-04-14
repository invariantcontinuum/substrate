-- The lazy-llamacpp embedding service uses Qwen3-Embedding-0.6B which emits
-- 1024-dimensional vectors. Previous migrations sized the columns for a
-- 768-dim model, so ingestion was failing with:
--   "expected 768 dimensions, not 1024"
-- Align the schema to the model. No rows have a non-null embedding yet
-- (ingestion never succeeded at this step) so the ALTER is safe.

ALTER TABLE file_embeddings ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE content_chunks  ALTER COLUMN embedding TYPE vector(1024);
