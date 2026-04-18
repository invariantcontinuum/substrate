-- services/graph/migrations/postgres/V1__initial_schema.sql
-- AGE extension, pgvector extension, and the 'substrate' graph are created
-- by the home-stack init script (01-init-databases.sh) as superuser.
-- This migration owns every relational table the substrate platform writes to.

CREATE TABLE sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type     TEXT NOT NULL DEFAULT 'github_repo',
    owner           TEXT NOT NULL,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    default_branch  TEXT DEFAULT 'main',
    config          JSONB NOT NULL DEFAULT '{}',
    last_sync_id    UUID,
    last_synced_at  TIMESTAMPTZ,
    meta            JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_type, owner, name)
);

CREATE TABLE sync_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id       UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','running','completed','failed','cancelled','cleaned')),
    config_snapshot JSONB NOT NULL DEFAULT '{}',
    ref             TEXT,
    progress_done   INT DEFAULT 0,
    progress_total  INT DEFAULT 0,
    progress_meta   JSONB,
    stats           JSONB DEFAULT '{}',
    schedule_id     BIGINT,
    triggered_by    TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_runs_source_completed ON sync_runs(source_id, completed_at DESC NULLS LAST);
CREATE INDEX idx_sync_runs_active           ON sync_runs(status) WHERE status IN ('pending','running');
CREATE UNIQUE INDEX ux_sync_runs_one_active_per_source
    ON sync_runs(source_id) WHERE status IN ('pending','running');

ALTER TABLE sources
    ADD CONSTRAINT sources_last_sync_fk
    FOREIGN KEY (last_sync_id) REFERENCES sync_runs(id) ON DELETE SET NULL;

CREATE TABLE sync_issues (
    id          BIGSERIAL PRIMARY KEY,
    sync_id     UUID NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    level       TEXT NOT NULL CHECK (level IN ('info','warning','error')),
    phase       TEXT NOT NULL,
    code        TEXT,
    message     TEXT NOT NULL,
    context     JSONB DEFAULT '{}',
    occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_issues_sync ON sync_issues(sync_id, level, occurred_at DESC);

CREATE TABLE sync_schedules (
    id               BIGSERIAL PRIMARY KEY,
    source_id        UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    interval_minutes INT NOT NULL,
    config_overrides JSONB DEFAULT '{}',
    enabled          BOOLEAN DEFAULT true,
    last_run_at      TIMESTAMPTZ,
    next_run_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, interval_minutes)
);

CREATE TABLE file_embeddings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_id         UUID NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    source_id       UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    domain          TEXT DEFAULT '',
    language        TEXT DEFAULT '',
    size_bytes      INT DEFAULT 0,
    line_count      INT DEFAULT 0,
    description     TEXT DEFAULT '',
    exports         TEXT[] DEFAULT '{}',
    imports_count   INT DEFAULT 0,
    status          TEXT DEFAULT 'healthy',
    embedding       vector(1024),
    content_hash    CHAR(64),
    last_commit_sha TEXT DEFAULT '',
    last_commit_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(sync_id, file_path)
);

CREATE INDEX idx_file_embeddings_sync        ON file_embeddings(sync_id);
CREATE INDEX idx_file_embeddings_source_path ON file_embeddings(source_id, file_path);
CREATE INDEX idx_file_embeddings_sync_type   ON file_embeddings(sync_id, type);

CREATE TABLE content_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id     UUID NOT NULL REFERENCES file_embeddings(id) ON DELETE CASCADE,
    sync_id     UUID NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content     TEXT NOT NULL,
    start_line  INT NOT NULL,
    end_line    INT NOT NULL,
    token_count INT NOT NULL,
    language    TEXT DEFAULT '',
    chunk_type  TEXT DEFAULT 'block',
    symbols     TEXT[] DEFAULT '{}',
    embedding   vector(1024),
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(file_id, chunk_index)
);

CREATE INDEX idx_content_chunks_file ON content_chunks(file_id);
CREATE INDEX idx_content_chunks_sync ON content_chunks(sync_id);
CREATE INDEX idx_content_chunks_fts  ON content_chunks USING gin (to_tsvector('english', content));
