-- services/graph/migrations/postgres/V1__initial_schema.sql
-- Consolidated initial schema as of 2026-04-21. Replaces the former
-- V1..V12 chain, which was collapsed pre-MVP: final-state DDL only,
-- applied to a fresh database via `make nuke && make up`.
--
-- Extensions (age, vector), the 'substrate' AGE graph, and the
-- 'File' / 'Symbol' vlabels are created as superuser by the
-- home-stack postgres init script (ops/infra/postgres/init/
-- 01-init-databases.sh) before Flyway runs. This migration owns
-- every relational table the substrate platform writes to, plus
-- the AGE property indexes that the query paths depend on.

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------
CREATE TABLE sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type     TEXT NOT NULL DEFAULT 'github_repo',
    owner           TEXT NOT NULL,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    default_branch  TEXT DEFAULT 'main',
    config          JSONB NOT NULL DEFAULT '{}',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    last_sync_id    UUID,
    last_synced_at  TIMESTAMPTZ,
    meta            JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (source_type, owner, name)
);

-- ---------------------------------------------------------------------------
-- sync_runs
-- ---------------------------------------------------------------------------
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
    denied_file_count INTEGER NOT NULL DEFAULT 0,
    schedule_id     BIGINT,
    triggered_by    TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_runs_source_completed
    ON sync_runs(source_id, completed_at DESC NULLS LAST);
CREATE INDEX idx_sync_runs_active
    ON sync_runs(status) WHERE status IN ('pending','running');
CREATE UNIQUE INDEX ux_sync_runs_one_active_per_source
    ON sync_runs(source_id) WHERE status IN ('pending','running');

-- Deferred FK: sources.last_sync_id -> sync_runs.id (back-reference).
ALTER TABLE sources
    ADD CONSTRAINT sources_last_sync_fk
    FOREIGN KEY (last_sync_id) REFERENCES sync_runs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- sync_issues
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- sync_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE sync_schedules (
    id               BIGSERIAL PRIMARY KEY,
    source_id        UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    interval_minutes INT NOT NULL,
    config_overrides JSONB DEFAULT '{}',
    enabled          BOOLEAN DEFAULT true,
    last_run_at      TIMESTAMPTZ,
    next_run_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (source_id, interval_minutes)
);

-- ---------------------------------------------------------------------------
-- file_embeddings
-- Final embedding dimension: 768 (nomic-embed-text-v2-moe, per lazy-lamacpp).
-- The startup dim guard (src.startup.check_embedding_dim) fail-fasts
-- if the configured embeddings model emits a different dimension.
-- ---------------------------------------------------------------------------
CREATE TABLE file_embeddings (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_id                  UUID NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    source_id                UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    file_path                TEXT NOT NULL,
    name                     TEXT NOT NULL,
    type                     TEXT NOT NULL,
    domain                   TEXT DEFAULT '',
    language                 TEXT DEFAULT '',
    size_bytes               INT DEFAULT 0,
    line_count               INT DEFAULT 0,
    description              TEXT DEFAULT '',
    description_generated_at TIMESTAMPTZ,
    exports                  TEXT[] DEFAULT '{}',
    imports_count            INT DEFAULT 0,
    status                   TEXT DEFAULT 'healthy',
    embedding                vector(768),
    content_hash             CHAR(64),
    last_commit_sha          TEXT DEFAULT '',
    last_commit_at           TIMESTAMPTZ,
    created_at               TIMESTAMPTZ DEFAULT now(),
    UNIQUE (sync_id, file_path)
);

CREATE INDEX idx_file_embeddings_sync        ON file_embeddings(sync_id);
CREATE INDEX idx_file_embeddings_source_path ON file_embeddings(source_id, file_path);
CREATE INDEX idx_file_embeddings_sync_type   ON file_embeddings(sync_id, type);
CREATE INDEX idx_file_embeddings_desc_gen
    ON file_embeddings(description_generated_at)
    WHERE description_generated_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- content_chunks
-- Populated by the AST/semantic chunker (substrate-graph-builder.chunker)
-- on each sync run. Embeddings use the same 768-dim model as file_embeddings.
-- ---------------------------------------------------------------------------
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
    embedding   vector(768),
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (file_id, chunk_index)
);

CREATE INDEX idx_content_chunks_file ON content_chunks(file_id);
CREATE INDEX idx_content_chunks_sync ON content_chunks(sync_id);
CREATE INDEX idx_content_chunks_fts
    ON content_chunks USING gin (to_tsvector('english', content));

-- ---------------------------------------------------------------------------
-- sse_events
-- Append-only event log backing the SSE bus. Producers insert a row and
-- emit pg_notify('substrate_sse', id) in the same transaction; subscribers
-- (gateway /api/events) replay past Last-Event-ID and stream NOTIFY ids.
-- 24h retention is managed by a cron in the graph service.
-- ---------------------------------------------------------------------------
CREATE TABLE sse_events (
    id          TEXT PRIMARY KEY,   -- ULID, monotonic, used as SSE `id:` / Last-Event-ID
    type        TEXT NOT NULL,
    sync_id     UUID NULL,
    source_id   UUID NULL,
    payload     JSONB NOT NULL,
    emitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sse_events_sync_id_idx
    ON sse_events (sync_id, emitted_at DESC)
    WHERE sync_id IS NOT NULL;

CREATE INDEX sse_events_source_id_idx
    ON sse_events (source_id, emitted_at DESC)
    WHERE source_id IS NOT NULL;

CREATE INDEX sse_events_emitted_at_brin
    ON sse_events USING BRIN (emitted_at);

-- ---------------------------------------------------------------------------
-- AGE property indexes
-- Cypher `MATCH (n:Label {k: v, ...})` lowers to `properties @> '{...}'::agtype`
-- containment. GIN with gin_agtype_ops is the operator class AGE ships for @>
-- on agtype — see V12 rationale in the historical chain (EXPLAIN cost dropped
-- from 10238 Parallel Seq Scan to 42 Bitmap Index Scan on the Symbol MATCH
-- shape used by graph_writer.write_age_edges / write_age_defines_edges).
-- ---------------------------------------------------------------------------
LOAD 'age';
SET LOCAL search_path = ag_catalog, public;

CREATE INDEX ix_substrate_file_properties
    ON substrate."File" USING gin (properties gin_agtype_ops);

CREATE INDEX ix_substrate_symbol_properties
    ON substrate."Symbol" USING gin (properties gin_agtype_ops);

ANALYZE substrate."File";
ANALYZE substrate."Symbol";

-- Reset search_path for the remaining statements so the ask_* tables below
-- land in `public` rather than `ag_catalog` (the LOAD 'age' block above set
-- search_path = ag_catalog, public, which persists for the transaction).
SET LOCAL search_path = public;

-- ---------------------------------------------------------------------------
-- ask_threads — one row per ChatGPT-style conversation.
-- ---------------------------------------------------------------------------
CREATE TABLE ask_threads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub    TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'New thread',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ask_threads_user_updated ON ask_threads(user_sub, updated_at DESC);

-- ---------------------------------------------------------------------------
-- ask_messages — user + assistant turns per thread. FK cascade on thread
-- delete. `citations` is hydrated {node_id,name,type} objects so the client
-- can render chips without a second round-trip. `sync_ids` snapshots the
-- active sync set at turn time so a reload renders the same retrieval scope.
-- ---------------------------------------------------------------------------
CREATE TABLE ask_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id   UUID NOT NULL REFERENCES ask_threads(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content     TEXT NOT NULL,
    citations   JSONB NOT NULL DEFAULT '[]',
    sync_ids    JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ask_messages_thread_created ON ask_messages(thread_id, created_at);

-- ---------------------------------------------------------------------------
-- leiden_cache — active-set Leiden results (spec §2.2)
-- ---------------------------------------------------------------------------
CREATE TABLE leiden_cache (
    cache_key          TEXT PRIMARY KEY,
    user_sub           TEXT NOT NULL,
    sync_ids           UUID[] NOT NULL,
    config             JSONB NOT NULL,
    community_count    INT NOT NULL,
    modularity         DOUBLE PRECISION NOT NULL,
    orphan_pct         DOUBLE PRECISION NOT NULL,
    community_sizes    INT[] NOT NULL,
    assignments        JSONB NOT NULL,
    labels             JSONB NOT NULL DEFAULT '{}'::jsonb,
    compute_ms         INT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at         TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX idx_leiden_cache_user     ON leiden_cache(user_sub);
CREATE INDEX idx_leiden_cache_expires  ON leiden_cache(expires_at);
CREATE INDEX idx_leiden_cache_sync_ids ON leiden_cache USING GIN (sync_ids);

-- ---------------------------------------------------------------------------
-- user_preferences — per-user defaults (spec §2.3)
-- ---------------------------------------------------------------------------
CREATE TABLE user_preferences (
    user_sub    TEXT PRIMARY KEY,
    prefs       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
