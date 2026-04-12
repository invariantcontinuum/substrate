CREATE EXTENSION IF NOT EXISTS age;
CREATE EXTENSION IF NOT EXISTS vector;

LOAD 'age';
SET search_path = ag_catalog, "$user", public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'substrate') THEN
        PERFORM create_graph('substrate');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    default_branch TEXT DEFAULT 'main',
    last_sync_at TIMESTAMPTZ,
    total_files INT DEFAULT 0,
    total_edges INT DEFAULT 0,
    status TEXT DEFAULT 'idle',
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(owner, name)
);

CREATE TABLE IF NOT EXISTS file_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    domain TEXT DEFAULT '',
    language TEXT DEFAULT '',
    size_bytes INT DEFAULT 0,
    line_count INT DEFAULT 0,
    description TEXT DEFAULT '',
    exports TEXT[] DEFAULT '{}',
    imports_count INT DEFAULT 0,
    status TEXT DEFAULT 'healthy',
    embedding vector(384),
    last_commit_sha TEXT DEFAULT '',
    last_commit_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(repo_id, file_path)
);

CREATE TABLE IF NOT EXISTS content_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES file_embeddings(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    start_line INT NOT NULL,
    end_line INT NOT NULL,
    token_count INT NOT NULL,
    language TEXT DEFAULT '',
    chunk_type TEXT DEFAULT 'block',
    symbols TEXT[] DEFAULT '{}',
    embedding vector(384) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(file_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_file_embeddings_repo ON file_embeddings(repo_id);
CREATE INDEX IF NOT EXISTS idx_file_embeddings_type ON file_embeddings(type);
CREATE INDEX IF NOT EXISTS idx_file_embeddings_language ON file_embeddings(language);
CREATE INDEX IF NOT EXISTS idx_file_embeddings_status ON file_embeddings(status);
CREATE INDEX IF NOT EXISTS idx_content_chunks_file ON content_chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_content_chunks_language ON content_chunks(language);
CREATE INDEX IF NOT EXISTS idx_content_chunks_type ON content_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_content_chunks_fts ON content_chunks USING gin (to_tsvector('english', content));
