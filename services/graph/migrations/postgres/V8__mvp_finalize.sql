-- services/graph/migrations/postgres/V8__mvp_finalize.sql
-- Spec: docs/superpowers/specs/2026-04-26-substrate-mvp-finalize-design.md
-- Plan: docs/superpowers/plans/2026-04-26-substrate-mvp-finalize.md (Phase 2)
-- Adds: runtime_config (UI tunable overrides), chat_message_evidence,
--       chat_message_context, chat_threads.context_files, chat_messages
--       edit/regenerate lineage (superseded_by / supersedes), and a
--       generated tsvector on file_embeddings.description for sparse
--       keyword retrieval. Single transaction (Flyway wraps each file).
--
-- NOTE: device naming is intentionally NOT added here. The MVP plan
-- originally referenced a `user_sessions.device_name` column, but that
-- table never existed; the equivalent surface already lives on
-- `user_devices.label` (V2). Phase 4's settings devices tab populates
-- that column directly.

-- ============================================================
-- 1. runtime_config: UI overrides for tunables.
-- ============================================================
CREATE TABLE IF NOT EXISTS runtime_config (
    scope       TEXT NOT NULL,
    key         TEXT NOT NULL,
    value       JSONB NOT NULL,
    updated_by  TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, key)
);
CREATE INDEX IF NOT EXISTS runtime_config_scope_idx ON runtime_config(scope);

-- ============================================================
-- 2. chat_message_evidence: per-turn cite_evidence tool calls.
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_message_evidence (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    filepath    TEXT NOT NULL,
    start_line  INT NOT NULL,
    end_line    INT NOT NULL,
    reason      TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_message_evidence_message_idx
    ON chat_message_evidence(message_id);

-- ============================================================
-- 3. chat_message_context: persisted snapshot of the prompt sent to LLM.
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_message_context (
    message_id    UUID PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
    system_prompt TEXT NOT NULL,
    history       JSONB NOT NULL,
    files         JSONB NOT NULL,
    tokens_in     INT NOT NULL,
    tokens_out    INT NOT NULL,
    duration_ms   INT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. chat_threads.context_files: per-thread file selection for chat
--    context (replaces the chat_thread_context_files join table for
--    the MVP redesign — that table remains for now and will be
--    decommissioned in a later phase if unused).
-- ============================================================
ALTER TABLE chat_threads
    ADD COLUMN IF NOT EXISTS context_files JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- 5. chat_messages edit/regenerate lineage.
-- ============================================================
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES chat_messages(id),
    ADD COLUMN IF NOT EXISTS supersedes    UUID REFERENCES chat_messages(id);
CREATE INDEX IF NOT EXISTS chat_messages_superseded_by_idx
    ON chat_messages(superseded_by);

-- ============================================================
-- 6. file_embeddings.description_tsv: tsvector for sparse keyword retrieval.
-- ============================================================
ALTER TABLE file_embeddings
    ADD COLUMN IF NOT EXISTS description_tsv tsvector
        GENERATED ALWAYS AS (to_tsvector('english', coalesce(description, ''))) STORED;
CREATE INDEX IF NOT EXISTS file_embeddings_description_tsv_idx
    ON file_embeddings USING GIN(description_tsv);
