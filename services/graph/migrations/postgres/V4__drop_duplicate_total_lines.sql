-- services/graph/migrations/postgres/V4__drop_duplicate_total_lines.sql
-- V3 introduced file_embeddings.total_lines without realising that V1
-- already provided the equivalent column file_embeddings.line_count
-- (INT DEFAULT 0), which is populated at ingestion and already passed
-- as the `total_lines=` argument to reconstruct_chunks throughout the
-- read API. V4 drops the duplicate. The chunker EOF coverage fix
-- (separate change) operates on line_count.
--
-- Forward-only — no rollback (pre-MVP per /home/dany/Desktop/AGENTS.md).

ALTER TABLE file_embeddings
    DROP COLUMN IF EXISTS total_lines;
