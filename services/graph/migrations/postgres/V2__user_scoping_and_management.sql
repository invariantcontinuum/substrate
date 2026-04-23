-- services/graph/migrations/postgres/V2__user_scoping_and_management.sql
-- User-scoped tenancy and profile/device management primitives.

-- ---------------------------------------------------------------------------
-- sources: user ownership boundary
-- ---------------------------------------------------------------------------
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS user_sub TEXT;

-- Existing pre-tenancy rows become legacy-owned; new API writes always set
-- an explicit user_sub from gateway-injected X-User-Sub.
UPDATE sources
SET user_sub = '__legacy__'
WHERE user_sub IS NULL;

ALTER TABLE sources
    ALTER COLUMN user_sub SET NOT NULL;

ALTER TABLE sources
    ALTER COLUMN user_sub SET DEFAULT 'dev';

ALTER TABLE sources
    DROP CONSTRAINT IF EXISTS sources_source_type_owner_name_key;

ALTER TABLE sources
    ADD CONSTRAINT sources_user_source_unique
    UNIQUE (user_sub, source_type, owner, name);

CREATE INDEX IF NOT EXISTS idx_sources_user_updated
    ON sources(user_sub, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_sources_user_id
    ON sources(user_sub, id);

-- ---------------------------------------------------------------------------
-- sse_events: user scoping for stream isolation
-- ---------------------------------------------------------------------------
ALTER TABLE sse_events
    ADD COLUMN IF NOT EXISTS user_sub TEXT;

CREATE INDEX IF NOT EXISTS sse_events_user_emitted_at_idx
    ON sse_events(user_sub, emitted_at DESC);

CREATE INDEX IF NOT EXISTS sse_events_user_sync_emitted_idx
    ON sse_events(user_sub, sync_id, emitted_at DESC)
    WHERE sync_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sse_events_user_source_emitted_idx
    ON sse_events(user_sub, source_id, emitted_at DESC)
    WHERE source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- user_profiles: app-level identity/profile mirror
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
    user_sub            TEXT PRIMARY KEY,
    preferred_username  TEXT NOT NULL DEFAULT '',
    email               TEXT NOT NULL DEFAULT '',
    display_name        TEXT NOT NULL DEFAULT '',
    role                TEXT NOT NULL DEFAULT 'viewer',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_last_seen
    ON user_profiles(last_seen_at DESC);

-- ---------------------------------------------------------------------------
-- user_devices: per-user, per-device metadata for account settings UX
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub        TEXT NOT NULL REFERENCES user_profiles(user_sub) ON DELETE CASCADE,
    device_id       TEXT NOT NULL,
    label           TEXT NOT NULL DEFAULT '',
    context_meta    JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_sub, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_last_seen
    ON user_devices(user_sub, last_seen_at DESC);
