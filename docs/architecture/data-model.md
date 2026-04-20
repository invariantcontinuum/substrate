# Data Model

Substrate uses a **single PostgreSQL instance with Apache AGE + pgvector**. All relational data, vector embeddings, SSE replay, and graph topology live in the one `substrate_graph` database. Keycloak has its own separate `keycloak` database in the same instance.

There is no `substrate_ingestion` database — the monorepo consolidated to a single data boundary.

---

## PostgreSQL schema

### `sources`

Connected code repositories.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `source_type` | text | Default `github_repo` |
| `owner` | text | Part of unique constraint |
| `name` | text | Part of unique constraint |
| `url` | text | |
| `default_branch` | text | Default `main` |
| `config` | JSONB | Ingestion config overrides |
| `enabled` | bool | V2: flip without deleting |
| `last_sync_id` | UUID → `sync_runs` | Nullable |
| `last_synced_at` | timestamptz | |
| `meta` | JSONB | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique: `(source_type, owner, name)`.

### `sync_runs`

One row per ingestion execution.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `source_id` | UUID FK → `sources` | ON DELETE CASCADE |
| `status` | text | `pending | running | completed | failed | cancelled | cleaned` |
| `config_snapshot` | JSONB | |
| `ref` | text | Git ref / branch |
| `progress_done` | int | |
| `progress_total` | int | |
| `progress_meta` | JSONB | |
| `stats` | JSONB | |
| `schedule_id` | bigint | Nullable — if triggered by a schedule |
| `triggered_by` | text | User or `schedule` |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | |
| `created_at` | timestamptz | |

Indexes include `idx_sync_runs_source_completed` and `idx_sync_runs_active` (partial). Partial unique `ux_sync_runs_one_active_per_source` guarantees one active (`pending|running`) sync per source.

### `sync_issues`

Structured warnings/errors recorded during a sync.

| Column | Type |
|---|---|
| `id` | bigserial PK |
| `sync_id` | UUID FK → `sync_runs` |
| `level` | text (`info | warning | error`) |
| `phase` | text (`parsing`, `graphing`, `embedding_summaries`, `embedding_chunks`, …) |
| `code` | text |
| `message` | text |
| `context` | JSONB |
| `occurred_at` | timestamptz |

Hard-capped at 1,000 issues per sync.

### `sync_schedules`

Periodic sync configuration.

| Column | Type |
|---|---|
| `id` | bigserial PK |
| `source_id` | UUID FK → `sources` |
| `interval_minutes` | int |
| `config_overrides` | JSONB |
| `enabled` | bool |
| `last_run_at` | timestamptz |
| `next_run_at` | timestamptz |
| `created_at` | timestamptz |

Unique: `(source_id, interval_minutes)`.

### `file_embeddings`

Main node table — one row per file per sync.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `sync_id` | UUID FK → `sync_runs` | |
| `source_id` | UUID FK → `sources` | |
| `file_path` | text | |
| `name` | text | Display name |
| `type` | text | `source | test | config | script | doc | data | asset | service` |
| `domain` | text | Default `""` |
| `language` | text | Detected language (plugin key or `markdown`/`text`/`""`) |
| `size_bytes` | int | |
| `line_count` | int | |
| `description` | text | Enriched-summary cache (LLM-generated paragraph) |
| `description_generated_at` | timestamptz | V3 — null until first `/summary` hit |
| `exports` | text[] | |
| `imports_count` | int | |
| `status` | text | Default `healthy` |
| `embedding` | `vector(896)` | File-level embedding |
| `content_hash` | char(64) | SHA-256 for divergence detection |
| `last_commit_sha` | text | |
| `last_commit_at` | timestamptz | |
| `created_at` | timestamptz | |

Unique: `(sync_id, file_path)`.

### `content_chunks`

AST / semantic chunks for RAG and file reconstruction.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `file_id` | UUID FK → `file_embeddings` | CASCADE on delete |
| `sync_id` | UUID FK → `sync_runs` | |
| `chunk_index` | int | 0-based, source order |
| `content` | text | Chunk text, with breadcrumb header |
| `start_line` | int | 1-based inclusive |
| `end_line` | int | 1-based inclusive |
| `token_count` | int | Rough estimator (`words × 1.3`) including breadcrumb |
| `language` | text | Populated by the chunker plugin (e.g. `python`, `markdown`, `text`, `""`) |
| `chunk_type` | text | `function | method | class | interface | struct | enum | impl | trait | module | namespace | heading | paragraph | line | block` |
| `symbols` | text[] | Construct identifiers (e.g. `["MyClass"]`, `["my_function"]`) |
| `embedding` | `vector(896)` | Chunk-level embedding |
| `created_at` | timestamptz | |

Unique: `(file_id, chunk_index)`. Indexes: `idx_content_chunks_file`, `idx_content_chunks_sync`, `idx_content_chunks_fts` (GIN FTS over `content`).

> **Heads-up:** `content_chunks.embedding` is populated on every sync but not yet read by any graph-service endpoint. It's compute + storage cost with no user-visible effect today; planned use is chunk-level search / unified retrieval (see graph-service.md).

### `sse_events`

SSE replay buffer — backs `GET /api/events`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | Becomes the `Last-Event-ID` |
| `type` | text | Event type (e.g. `sync_lifecycle`, `sync_progress`, `source_changed`) |
| `sync_id` | UUID | Nullable |
| `source_id` | UUID | Nullable |
| `payload` | JSONB | |
| `created_at` | timestamptz | |

Writers call `NOTIFY substrate_sse, <id>::text`; the gateway `LISTEN`s on the same channel and fans out to every open EventSource client, replaying past rows greater than the client's `Last-Event-ID` header on reconnect.

---

## Apache AGE graph schema

AGE (a PostgreSQL extension) gives us Cypher inside Postgres — Substrate does not run Neo4j. The graph is named **`substrate`**.

### Node types

**`:File`** — represents a source file. Properties:

- `file_id` → `file_embeddings.id`
- `sync_id` → `sync_runs.id`
- `source_id` → `sources.id`
- `name` → display name
- `type` → file classification
- `domain` → domain label

**`:Symbol`** — represents a named construct (function/class/method) extracted by a graph-builder plugin. Properties:

- `symbol_id`
- `file_id` → owning file
- `sync_id`, `source_id`
- `name`, `kind` (`function | class | method`), `line`

### Relationship types

- **`depends_on`** — file-to-file dependency (inferred from resolved imports). Properties: `sync_id`, `source_id`, `weight`.
- **`defines`** — file-to-symbol (the file defines this symbol). Properties: `sync_id`, `source_id`.

### Cypher patterns used

```cypher
-- Count all edges (stats)
MATCH ()-[r]->() RETURN count(r)

-- Merged snapshot edges
MATCH (a:File)-[r:depends_on]->(b:File)
WHERE r.sync_id IN ['uuid1', 'uuid2']
RETURN a.source_id, a.file_id, b.source_id, b.file_id, r.weight, r.sync_id

-- Neighbors of a specific file (node detail panel, enriched summary)
MATCH (a:File {file_id: '...'})-[r]-(b:File)
RETURN b.file_id, label(r), r.weight, r.sync_id
```

The btree expression index on `properties -> '"file_id"'::agtype` (V5) keeps file-id lookups logarithmic against the File vertex table.

---

## Snapshot query system

When the frontend requests a graph, the Graph Service runs a **merged snapshot** over the requested syncs:

1. **Node resolution** — a SQL window function picks the latest version of each file across the requested syncs:
   ```sql
   row_number() OVER (
     PARTITION BY source_id, file_path
     ORDER BY completed_at DESC
   )
   ```
2. **Divergence detection** — a node is marked `divergent: true` when the same `(source_id, file_path)` appears in multiple requested syncs with different `content_hash`.
3. **Edge retrieval** — queries AGE for all `depends_on` edges where `r.sync_id` is in the requested set, deduplicates, and aggregates by `(source, target)`.

---

## Node identity format

Nodes in the API and frontend are identified by:

```
src_<source_id>:<file_path>
```

Example:
```
src_550e8400-e29b-41d4-a716-446655440000:src/main.py
```

Used in:
- Frontend graph element IDs
- API path parameters (`/api/graph/nodes/{node_id:path}`)
- AGE neighbor resolution

---

## Embeddings pipeline

### File-level (`file_embeddings.embedding`)

Source string (from `services/ingestion/src/chunker.py::file_summary_text`):

```
path: <file_path>
type: <source|test|config|…>
language: <python|typescript|…>

<first 100 lines of file>
```

This string is prefixed with `search_document: `, hard-truncated to 1400 chars, and sent to the embedding LLM. The returned 896-dim vector is backfilled into `file_embeddings.embedding` after the initial row insert.

### Chunk-level (`content_chunks.embedding`)

Each chunk's `content` (which already includes a breadcrumb header `# file: <path>\n# in: <ancestor chain>\n\n<body>`) is prefixed with `search_document: `, truncated to 1400 chars, and embedded. Populated but not yet queried by any endpoint.

### Query-side

The graph service's `/api/graph/search` endpoint embeds the incoming query as `search_query: <q>` — the same embedding model; the `search_document:` / `search_query:` prefix scheme is how jina-code-embeddings clusters corpus vs queries.

### Current model config

| Setting | Value |
|---|---|
| Model | `jina-code-embeddings-0.5b` (GGUF Q8_0) |
| Dimensions | 896 |
| Chunker budget | 512 tokens per chunk |
| Chunker overlap | 64 tokens (line-greedy / text / markdown paths only — AST path relies on breadcrumbs instead) |
| Endpoint | `http://host.docker.internal:8101/v1/embeddings` |

See `services/graph/migrations/postgres/V4, V7, V8, V9, V10` for the history of embedding-dim migrations as models changed.

---

## Enriched summary pipeline

Separate from embeddings. Triggered by `GET /api/graph/nodes/{id}/summary`. Pipeline:

1. Read `file_embeddings` row + all `content_chunks` for the file
2. Reconstruct the full file text via line-overlap dedup (`reconstruct_chunks`)
3. Fetch AGE edge neighbors, pull their cached `file_embeddings.description` + first 8 lines of their first chunk
4. Rank neighbors by cosine similarity of `file_embeddings.embedding`
5. Assemble prompt: full file (capped at 88 % of 100 k char budget) + top-10 neighbors (10 % of budget)
6. Call dense LLM (`temperature=0.2`, `max_tokens=400`, `enable_thinking=false`)
7. Cache output in `file_embeddings.description` + `description_generated_at`

Retry at `[1.0, 0.5, 0.25]` budget scales on HTTP 400 with a context-window error message.

---

## Data retention

| Data | Retention | Notes |
|---|---|---|
| Sources | Indefinite | Deleting cascades to sync_runs / file_embeddings / AGE |
| Sync runs | Indefinite | Can be cleaned/purged via API (`/api/syncs/{id}/clean` or DELETE) |
| File embeddings | Per sync | Deleted when sync is purged |
| Content chunks | Per sync | Cascades on `file_embeddings` delete |
| AGE graph nodes | Per sync | Removed by `cleanup_partial(sync_id)` |
| SSE events | Rolling | Not currently pruned; retention policy TBD |
