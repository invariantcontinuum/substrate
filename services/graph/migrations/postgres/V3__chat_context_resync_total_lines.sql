-- services/graph/migrations/postgres/V3__chat_context_resync_total_lines.sql
-- Spec: docs/superpowers/specs/2026-04-25-backend-foundations-design.md
-- Adds: chat-context model (active per-user + per-thread file overrides),
--       snapshot resume cursor (parent_sync_id + resume_cursor), and a
--       file_embeddings.total_lines column for end-of-file padding.
-- Single transaction; rollback is a forward-only `git revert` of the
-- migration file plus a cleanup migration (pre-MVP posture per
-- /home/dany/Desktop/AGENTS.md).

-- ---------------------------------------------------------------------
-- 1. Active per-user chat context (single row in user_profiles)
-- ---------------------------------------------------------------------
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS active_chat_context JSONB NULL;

-- ---------------------------------------------------------------------
-- 2. Per-thread context summary (frozen snapshot at create-time)
-- ---------------------------------------------------------------------
ALTER TABLE ask_threads
    ADD COLUMN IF NOT EXISTS context_summary JSONB NULL;

-- ---------------------------------------------------------------------
-- 3. Per-thread context-files (the modal's editable surface)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ask_thread_context_files (
    thread_id     UUID NOT NULL REFERENCES ask_threads(id) ON DELETE CASCADE,
    file_id       UUID NOT NULL REFERENCES file_embeddings(id) ON DELETE CASCADE,
    path          TEXT NOT NULL,
    language      TEXT NULL,
    total_tokens  INT  NOT NULL,
    included      BOOL NOT NULL DEFAULT TRUE,
    PRIMARY KEY (thread_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_ask_thread_context_files_included
    ON ask_thread_context_files (thread_id)
    WHERE included = TRUE;

-- ---------------------------------------------------------------------
-- 4. Snapshot resume cursor on sync_runs
-- ---------------------------------------------------------------------
ALTER TABLE sync_runs
    ADD COLUMN IF NOT EXISTS parent_sync_id UUID NULL
        REFERENCES sync_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS resume_cursor JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_sync_runs_parent_sync_id
    ON sync_runs(parent_sync_id)
    WHERE parent_sync_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 5. file_embeddings.total_lines (nullable for V3; backfill in V4;
--    NOT NULL in V5)
-- ---------------------------------------------------------------------
ALTER TABLE file_embeddings
    ADD COLUMN IF NOT EXISTS total_lines INT NULL;
