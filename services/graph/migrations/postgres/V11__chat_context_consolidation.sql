-- services/graph/migrations/postgres/V11__chat_context_consolidation.sql
-- Spec: docs/superpowers/specs/2026-04-27-substrate-fixes-design.md §2
--
-- Collapses chat-context persistence from two parallel layers (the
-- chat_thread_context_files table and chat_threads.context_files
-- JSONB) into a single `chat_threads.context` JSONB column with a
-- {scope, selection} shape. Pre-MVP posture (CLAUDE.md): no
-- back-compat, single break-glass migration.

-- 1. Drop the relic join table (Layer B).
DROP TABLE IF EXISTS chat_thread_context_files;

-- 2. Drop unused / superseded columns on chat_threads.
ALTER TABLE chat_threads
    DROP COLUMN IF EXISTS context_files,
    DROP COLUMN IF EXISTS context_summary;

-- 3. Add the consolidated context column.
ALTER TABLE chat_threads
    ADD COLUMN context JSONB NOT NULL DEFAULT
      '{"scope":{"sync_ids":[],"source_ids":[]},"selection":{"kind":"all"}}'::jsonb;

-- 4. Reshape user_profiles.active_chat_context to the new
-- {sync_ids, source_ids} shape. The community_ids and file_ids keys
-- are dropped (selection moves to per-thread).
UPDATE user_profiles
SET active_chat_context = jsonb_build_object(
      'sync_ids',  COALESCE(active_chat_context -> 'sync_ids',  '[]'::jsonb),
      'source_ids', COALESCE(active_chat_context -> 'source_ids', '[]'::jsonb)
    )
WHERE active_chat_context IS NOT NULL;
