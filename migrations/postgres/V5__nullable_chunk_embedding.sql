-- A content chunk carries useful payload (text, line range, language,
-- token count, symbols) even when the embedding model rejects it or is
-- unavailable. Forcing `embedding NOT NULL` meant ingestion had to drop
-- every chunk whose vector couldn't be generated, leaving the
-- description column empty and the node-detail summary stuck on
-- "no content has been indexed". Relax the constraint so chunks can be
-- stored and later re-embedded, and used for summary generation even
-- without a vector.

ALTER TABLE content_chunks ALTER COLUMN embedding DROP NOT NULL;
