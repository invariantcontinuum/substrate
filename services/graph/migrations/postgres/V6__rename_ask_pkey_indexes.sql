-- V6: Rename leftover `ask_*_pkey` primary-key backing indexes to `chat_*_pkey`.
-- Postgres does not auto-rename PK backing indexes when a table is renamed,
-- so V5 left these three behind. Cosmetic cleanup; no functional change.

ALTER INDEX ask_threads_pkey              RENAME TO chat_threads_pkey;
ALTER INDEX ask_messages_pkey             RENAME TO chat_messages_pkey;
ALTER INDEX ask_thread_context_files_pkey RENAME TO chat_thread_context_files_pkey;
