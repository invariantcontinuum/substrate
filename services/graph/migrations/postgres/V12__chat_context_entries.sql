ALTER TABLE chat_threads DROP COLUMN context;
ALTER TABLE chat_threads
    ADD COLUMN context     JSONB NOT NULL
        DEFAULT '{"entries": [], "frozen_at": null}'::jsonb,
    ADD COLUMN archived_at TIMESTAMPTZ;

ALTER TABLE user_profiles DROP COLUMN active_chat_context;
ALTER TABLE user_profiles
    ADD COLUMN chat_settings JSONB NOT NULL
        DEFAULT '{"history_turns": 12}'::jsonb;
