-- V6: append-only event log that backs the SSE bus.
--
-- Producers (ingestion, graph) insert a row and emit
-- `pg_notify('substrate_sse', id)` in the same transaction. Subscribers
-- (gateway /api/events) first replay any rows past their Last-Event-ID
-- then stream new ids from NOTIFY. 24h retention is managed by a cron
-- in the graph service (added in SP-1 Phase 9 alongside the shared lib).

CREATE TABLE IF NOT EXISTS sse_events (
    id          TEXT PRIMARY KEY,         -- ULID, monotonic, used as SSE `id:` / Last-Event-ID
    type        TEXT NOT NULL,
    sync_id     UUID NULL,
    source_id   UUID NULL,
    payload     JSONB NOT NULL,
    emitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sse_events_sync_id_idx
    ON sse_events (sync_id, emitted_at DESC)
    WHERE sync_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sse_events_source_id_idx
    ON sse_events (source_id, emitted_at DESC)
    WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sse_events_emitted_at_brin
    ON sse_events USING BRIN (emitted_at);
