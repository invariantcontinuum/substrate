-- services/graph/migrations/postgres/V3__description_generated_at.sql
-- Adds a timestamp column tracking when the enriched summary was last
-- written to file_embeddings.description. Null means "never summarized".

ALTER TABLE file_embeddings
  ADD COLUMN IF NOT EXISTS description_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_file_embeddings_desc_gen
  ON file_embeddings(description_generated_at)
  WHERE description_generated_at IS NOT NULL;
