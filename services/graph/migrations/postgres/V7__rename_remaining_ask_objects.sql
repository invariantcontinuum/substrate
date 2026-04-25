-- V7: Rename leftover `ask_*` constraints + index missed by V5/V6.
-- - ask_messages_role_check       → chat_messages_role_check (CHECK constraint)
-- - ask_messages_thread_id_fkey   → chat_messages_thread_id_fkey (FK)
-- - ask_thread_context_files_file_id_fkey → chat_thread_context_files_file_id_fkey (FK)
-- - idx_ask_thread_context_files_included → idx_chat_thread_context_files_included (named index)
-- After this migration, no objects in pg_class, pg_constraint, or pg_indexes
-- carry an `ask_*` prefix.

ALTER TABLE chat_messages
  RENAME CONSTRAINT ask_messages_role_check
  TO chat_messages_role_check;

ALTER TABLE chat_messages
  RENAME CONSTRAINT ask_messages_thread_id_fkey
  TO chat_messages_thread_id_fkey;

ALTER TABLE chat_thread_context_files
  RENAME CONSTRAINT ask_thread_context_files_file_id_fkey
  TO chat_thread_context_files_file_id_fkey;

ALTER INDEX idx_ask_thread_context_files_included
  RENAME TO idx_chat_thread_context_files_included;
