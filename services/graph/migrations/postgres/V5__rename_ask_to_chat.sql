-- V5: Rename `ask_*` tables to `chat_*`. Pre-MVP break-glass; no inverse migration.
-- See spec /home/dany/Desktop/docs/superpowers/specs/2026-04-25-global-app-shell-redesign-design.md §5.1
-- and plan /home/dany/Desktop/docs/superpowers/plans/2026-04-25-global-app-shell-redesign.md Task 1.

ALTER TABLE ask_threads               RENAME TO chat_threads;
ALTER TABLE ask_messages              RENAME TO chat_messages;
ALTER TABLE ask_thread_context_files  RENAME TO chat_thread_context_files;

ALTER TABLE chat_thread_context_files
  RENAME CONSTRAINT ask_thread_context_files_thread_id_fkey
  TO chat_thread_context_files_thread_id_fkey;

ALTER INDEX ask_threads_user_updated    RENAME TO chat_threads_user_updated;
ALTER INDEX ask_messages_thread_created RENAME TO chat_messages_thread_created;
