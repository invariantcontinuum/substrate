CREATE TABLE raw_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source        TEXT NOT NULL,
    event_type    TEXT NOT NULL,
    payload       JSONB NOT NULL,
    received_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE graph_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    nodes_affected  JSONB,
    edges_affected  JSONB,
    published       BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_raw_events_source ON raw_events(source, received_at);
CREATE INDEX idx_graph_events_unpublished ON graph_events(published) WHERE NOT published;
