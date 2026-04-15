# Graph Service

**Port:** 8082  
**Language:** Python 3.12 / FastAPI  
**Repository:** `services/graph/`

---

## Overview

The Graph Service is the **read-only query layer** for the Substrate platform's code-knowledge graph. It serves graph data to the frontend, performs semantic search over embeddings, and generates on-demand LLM summaries.

**Important:** The Graph Service does **not** perform ingestion. It only reads what the Ingestion Service writes into PostgreSQL + Apache AGE.

---

## Responsibilities

1. **Graph Queries**: Serve merged graph snapshots across multiple syncs
2. **Semantic Search**: Vector similarity search over file and chunk embeddings
3. **LLM Summaries**: Generate and cache natural language summaries for files
4. **Source Management**: CRUD endpoints for connected repositories
5. **Sync History**: Read-only access to sync runs, issues, and schedules

---

## Architecture

```mermaid
flowchart TB
    subgraph GraphService["Graph Service"]
        API[REST API]
        STORE[Graph Store]
        SNAP[Snapshot Query]
    end

    subgraph Storage
        PG[(PostgreSQL)]
        AGE[Apache AGE]
    end

    API -->|/api/graph| SNAP
    API -->|/api/graph/search| STORE
    API -->|/api/graph/nodes/{id}/summary| STORE
    API -->|/api/sources| STORE

    SNAP -->|SQL| PG
    SNAP -->|Cypher| AGE
    STORE -->|SQL| PG
    STORE -->|Cypher| AGE
```

---

## API Endpoints

### Health

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness check |

### Graph (`/api/graph`)

| Method | Path | Parameters | Purpose |
|--------|------|------------|---------|
| `GET` | `/api/graph` | `sync_ids` (comma-separated UUIDs, required) | Returns merged graph for requested syncs |
| `GET` | `/api/graph/nodes/{node_id:path}` | `sync_id` (optional) | Returns detailed node metadata + AGE neighbors |
| `GET` | `/api/graph/nodes/{node_id:path}/summary` | `sync_id` (optional), `force` (bool) | Returns/caches LLM summary |
| `GET` | `/api/graph/stats` | — | Platform-wide node/edge counts |
| `GET` | `/api/graph/search` | `q`, `type`, `limit` | Vector similarity search |

### Sources (`/api/sources`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sources` | Cursor-paginated list |
| `POST` | `/api/sources` | Create new source (upserts on conflict) |
| `GET` | `/api/sources/{source_id}` | Get single source |
| `PATCH` | `/api/sources/{source_id}` | Update `config` JSONB only |
| `DELETE` | `/api/sources/{source_id}` | Delete source (cascades) |

### Syncs (`/api/syncs`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/syncs` | Cursor-paginated list, filter by `source_id`/`status` |
| `GET` | `/api/syncs/{sync_id}` | Get single sync run |
| `GET` | `/api/syncs/{sync_id}/issues` | List issues, filter by `level`/`phase` |

### Schedules (`/api/schedules`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/schedules` | List all schedules, filter by `source_id` |

---

## Key Modules

### `store.py`

The database access layer.

- **Pool management**: `connect()` / `disconnect()` using `asyncpg.create_pool`
- **AGE initialization**: On every new connection, runs `LOAD 'age'` and sets `search_path = ag_catalog,public`
- **Dataclasses**: `GraphNode`, `GraphEdge`, `GraphSnapshot`
- **Cytoscape helpers**: Converts dataclasses to frontend-friendly `{"data": {...}}` format
- **`get_stats()`**: Counts nodes by type and total edges via AGE
- **`search()`**: Vector similarity using `<=>` (cosine distance) on `file_embeddings.embedding`
- **`ensure_node_summary()`**: The LLM summary pipeline — validates node, returns cached summary if present, fetches chunks, calls local dense LLM, persists result

### `snapshot_query.py`

Implements the **merged-graph read model**.

- **`get_merged_graph(sync_ids)`**:
  1. Validates UUIDs
  2. Uses SQL window function to pick the latest version of each file across syncs
  3. Detects divergence (different `content_hash` across syncs)
  4. Returns cytoscape-style nodes
  5. Queries AGE for edges, deduplicates and aggregates across syncs

- **`get_node_detail(node_id, sync_id=None)`**:
  1. Parses `src_<source_id>:<file_path>` identifier
  2. Resolves latest sync if not provided
  3. Returns full metadata + AGE neighbors

### `routes.py`

Graph-specific HTTP endpoints.

- `_embed_query(query)`: Calls the external embedding service to vectorize search queries
- `GET /api/graph`: Delegates to `snapshot_query.get_merged_graph`
- `GET /api/graph/nodes/{id}`: Delegates to `snapshot_query.get_node_detail`
- `GET /api/graph/nodes/{id}/summary`: Delegates to `store.ensure_node_summary`
- `GET /api/graph/stats`: Delegates to `store.get_stats`
- `GET /api/graph/search`: Embeds query, then delegates to `store.search`

### `sources.py`

CRUD for `sources` table with cursor-based pagination.

### `syncs.py`

Read-only sync run endpoints with cursor-based pagination.

### `schedules.py`

Read-only schedule listing.

---

## Apache AGE Integration

The Graph Service uses **Apache AGE** (a PostgreSQL extension) rather than standalone Neo4j.

### Graph Name
- **`substrate`**

### Node Type
- **`:File`** with properties: `file_id`, `sync_id`, `source_id`, `name`, `type`, `domain`

### Relationship Type
- **`depends_on`** with properties: `sync_id`, `source_id`, `weight`

### Cypher Execution

Cypher queries are executed via:
```sql
SELECT * FROM cypher('substrate', $$ ... $$) AS (v agtype)
```

Results are parsed from `agtype` using `json.loads()`.

---

## Snapshot Query: Divergence Detection

A node is marked `"divergent": true` when the same `(source_id, file_path)` appears in multiple requested syncs with different `content_hash` values. This enables branch comparison and change tracking.

Example response node:
```json
{
  "data": {
    "id": "src_550e8400-...:src/main.py",
    "name": "main.py",
    "type": "source",
    "domain": "",
    "source_id": "550e8400-...",
    "file_path": "src/main.py",
    "loaded_sync_ids": ["sync-a", "sync-b"],
    "latest_sync_id": "sync-b",
    "divergent": true
  }
}
```

---

## Configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| `DATABASE_URL` | `postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph` | Postgres connection |
| `EMBEDDING_URL` | `http://localhost:8101/v1/embeddings` | Embedding service endpoint |
| `EMBEDDING_MODEL` | `embeddinggemma-300M-Q8_0.gguf` | Model name for embedding service |
| `DENSE_LLM_URL` | `http://localhost:8102/v1/chat/completions` | Dense LLM endpoint for summaries |
| `DENSE_LLM_MODEL` | `qwen2.5-7b-instruct` | Model name for summaries |
| `SUMMARY_MAX_TOKENS` | `160` | Max tokens for summary output |
| `SUMMARY_CHUNK_SAMPLE_CHARS` | `4000` | Characters of chunk content to feed LLM |
| `APP_PORT` | `8082` | Service port |

---

## Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| Merged graph query | 50-500ms | Depends on snapshot size |
| Node detail | 20-100ms | AGE neighbor query |
| Semantic search | 100-500ms | Includes embedding call + pgvector query |
| Summary generation | 2-10s | Includes dense LLM call |
| Stats | 10-50ms | Simple counts |

---

## Test Coverage

| Test File | Coverage |
|-----------|----------|
| `test_store.py` | Graph model dataclasses, Cytoscape conversion |
| `test_snapshot_query.py` | Divergence detection in merged graphs |
| `test_sources_api.py` | Source CRUD end-to-end |
| `test_syncs_api.py` | Sync/schedule listing |

**Gaps:**
- No tests for search endpoint (requires embedding service)
- No tests for summary endpoint (requires LLM service)
- No tests for AGE edge queries in merged graph
