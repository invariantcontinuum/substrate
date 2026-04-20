# Data Model

Substrate uses **PostgreSQL with Apache AGE** as its primary data store. All relational data, vector embeddings, and graph topology live in the same database instance.

---

## PostgreSQL Schema

### Core Tables

#### `sources`

Connected code repositories.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `source_type` | text | Default `github_repo` |
| `owner` | text | Part of unique constraint |
| `name` | text | Part of unique constraint |
| `url` | text | |
| `default_branch` | text | Default `main` |
| `config` | JSONB | Ingestion config overrides |
| `last_sync_id` | UUID → `sync_runs` | Nullable |
| `last_synced_at` | timestamptz | |
| `meta` | JSONB | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Constraints:**
- Unique: `(source_type, owner, name)`

#### `sync_runs`

Individual ingestion executions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `source_id` | UUID FK → `sources` | ON DELETE CASCADE |
| `status` | text | `pending \| running \| completed \| failed \| cancelled \| cleaned` |
| `config_snapshot` | JSONB | |
| `ref` | text | Git ref / branch |
| `progress_done` | int | |
| `progress_total` | int | |
| `progress_meta` | JSONB | |
| `stats` | JSONB | |
| `schedule_id` | bigint | |
| `triggered_by` | text | |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | |
| `created_at` | timestamptz | |

**Indexes:**
- `idx_sync_runs_source_completed`
- `idx_sync_runs_active` (partial, active statuses)
- Partial unique: `ux_sync_runs_one_active_per_source` — one active run per source

#### `sync_issues`

Structured warnings/errors recorded during a sync.

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `sync_id` | UUID FK → `sync_runs` | |
| `level` | text | `info \| warning \| error` |
| `phase` | text | e.g. `parsing`, `graphing`, `embedding` |
| `code` | text | Error code |
| `message` | text | Human-readable message |
| `context` | JSONB | Additional context |
| `occurred_at` | timestamptz | |

**Behavior:** Hard-capped at 1,000 issues per sync to prevent table blowup.

#### `sync_schedules`

Periodic sync configuration.

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigserial PK | |
| `source_id` | UUID FK → `sources` | |
| `interval_minutes` | int | |
| `config_overrides` | JSONB | |
| `enabled` | bool | |
| `last_run_at` | timestamptz | |
| `next_run_at` | timestamptz | |
| `created_at` | timestamptz | |

**Constraints:**
- Unique: `(source_id, interval_minutes)`

#### `file_embeddings`

The main node table — one row per file per sync.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `sync_id` | UUID FK → `sync_runs` | |
| `source_id` | UUID FK → `sources` | |
| `file_path` | text | |
| `name` | text | Display name |
| `type` | text | `source \| test \| config \| script \| doc \| data \| asset \| service` |
| `domain` | text | Default `''` |
| `language` | text | Detected language |
| `size_bytes` | int | |
| `line_count` | int | |
| `description` | text | LLM-generated summary (cached) |
| `exports` | text[] | |
| `imports_count` | int | |
| `status` | text | Default `healthy` |
| `embedding` | `vector(1024)` | pgvector file-level embedding |
| `content_hash` | char(64) | SHA-256 for divergence detection |
| `last_commit_sha` | text | |
| `last_commit_at` | timestamptz | |
| `created_at` | timestamptz | |

**Constraints:**
- Unique: `(sync_id, file_path)`

#### `content_chunks`

Text chunks for RAG and detailed retrieval.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `file_id` | UUID FK → `file_embeddings` | CASCADE on delete |
| `sync_id` | UUID FK → `sync_runs` | |
| `chunk_index` | int | 0-based |
| `content` | text | Chunk text |
| `start_line` | int | |
| `end_line` | int | |
| `token_count` | int | |
| `language` | text | |
| `chunk_type` | text | Default `block` |
| `symbols` | text[] | |
| `embedding` | `vector(1024)` | pgvector chunk-level embedding |
| `created_at` | timestamptz | |

**Constraints:**
- Unique: `(file_id, chunk_index)`

**Indexes:**
- `idx_content_chunks_file`
- `idx_content_chunks_sync`
- `idx_content_chunks_fts` (GIN full-text search)

---

## Apache AGE Graph Schema

Substrate uses **Apache AGE** (a PostgreSQL extension) instead of a standalone Neo4j server. The graph is named **`substrate`**.

### Node Type

**`:File`** — represents a source file.

Properties:
- `file_id` → `file_embeddings.id`
- `sync_id` → `sync_runs.id`
- `source_id` → `sources.id`
- `name` → display name
- `type` → file classification
- `domain` → domain label

### Relationship Type

**`depends_on`** — represents a dependency between files.

Properties:
- `sync_id` → which sync run created the edge
- `source_id` → repository source
- `weight` → numeric strength of the relationship

### Cypher Queries Used

```cypher
-- Count all edges
MATCH ()-[r]->() RETURN count(r)

-- Get edges for specific syncs
MATCH (a:File)-[r]->(b:File)
WHERE r.sync_id IN ['uuid1', 'uuid2']
RETURN a.source_id, a.file_id, b.source_id, b.file_id, r.weight, r.sync_id

-- Get neighbors of a specific file
MATCH (a:File {file_id: '...', sync_id: '...'})-[r]-(b:File)
WHERE r.sync_id = '...'
RETURN b.file_id, label(r), r.weight
```

---

## Snapshot Query System

When the frontend requests a graph visualization, the Graph Service runs the **snapshot query** to merge multiple syncs:

1. **Node resolution** — Uses a SQL window function to pick the *latest* version of each file across the requested syncs:
   ```sql
   row_number() OVER (
     PARTITION BY source_id, file_path
     ORDER BY completed_at DESC
   )
   ```

2. **Divergence detection** — Marks a node as `divergent: true` when the same `(source_id, file_path)` appears in multiple requested syncs with different `content_hash` values.

3. **Edge retrieval** — Queries AGE for all `depends_on` edges where `r.sync_id` is in the requested set, then deduplicates and aggregates by `(source, target)` pair.

---

## Node Identity Format

Nodes in the API and frontend are identified by:

```
src_<source_id>:<file_path>
```

Example:
```
src_550e8400-e29b-41d4-a716-446655440000:src/main.py
```

This format is used in:
- Frontend graph element IDs
- API path parameters (`/api/graph/nodes/{node_id}`)
- AGE neighbor resolution

---

## Embeddings Pipeline

### File-Level Embeddings

Stored in `file_embeddings.embedding`. Generated from a summary string:

```
path: src/main.py
type: source
language: python

<first 100 lines of file>
```

### Chunk-Level Embeddings

Stored in `content_chunks.embedding`. Generated from the raw chunk content.

### Model Configuration

| Setting | Default |
|---------|---------|
| Model | `Qwen3-Embedding-0.6B-Q8_0.gguf` |
| Dimensions | 1024 |
| Chunk size | 512 tokens |
| Chunk overlap | 64 tokens |
| Endpoint | `http://localhost:8101/v1/embeddings` |

---

## Data Retention

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Sync runs | Indefinite | Can be cleaned/purged via API |
| File embeddings | Per sync | Deleted when sync is purged |
| Content chunks | Per sync | Cascades on file_embeddings delete |
| AGE graph nodes | Per sync | Removed by `cleanup_partial(sync_id)` |
| Source metadata | Indefinite | Unless source is deleted |
