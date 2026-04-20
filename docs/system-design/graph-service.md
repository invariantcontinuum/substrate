# Graph Service

**Host port:** 8182 (debug)
**Container port:** 8082
**Language:** Python 3.12 / FastAPI
**Repository:** `services/graph/`

---

## Overview

The Graph Service is the **read-only query layer** over Substrate's code-knowledge graph. It serves merged graph snapshots, performs semantic search over file-level embeddings, and runs the **enriched summary** pipeline that feeds the node-detail UI.

Important: the Graph Service does **not** ingest. It reads what ingestion wrote into PostgreSQL + Apache AGE. It also handles reads for `sources`, `syncs`, and `schedules` — writes for those go through the gateway to ingestion.

---

## Responsibilities

1. **Graph queries** — merged snapshots across multiple syncs
2. **Semantic search** — pgvector cosine similarity over `file_embeddings.embedding`
3. **Enriched summaries** — full file + top-K neighbors → dense LLM, cached
4. **File reconstruction** — rebuild a file's full text from `content_chunks`
5. **Source / sync / schedule reads** — list + detail endpoints (writes are the ingestion service's concern)

---

## Architecture

```mermaid
flowchart TB
    subgraph GraphService
        API[REST API]
        STORE[store.py]
        SNAP[snapshot_query.py]
        SUM[enriched_summary.py]
        REC[file_reconstruct.py]
    end

    subgraph Storage
        PG[(substrate_graph)]
        AGE[Apache AGE]
    end

    subgraph AI
        EMB[Embedding LLM :8101]
        DENSE[Dense LLM :8102]
    end

    API -->|/api/graph| SNAP
    API -->|/api/graph/search| STORE
    API -->|/api/graph/nodes/{id}/summary| SUM
    API -->|/api/graph/nodes/{id}/file| REC
    API -->|/api/sources, /api/syncs, /api/schedules| STORE

    SNAP -->|SQL window| PG
    SNAP -->|Cypher| AGE
    STORE -->|SQL| PG
    STORE -->|Cypher| AGE
    SUM -->|SQL| PG
    SUM -->|Cypher| AGE
    SUM -->|embed query| EMB
    SUM -->|chat completion| DENSE
    REC -->|SQL| PG
```

---

## API endpoints

### Health

| Method | Path |
|---|---|
| `GET` | `/health` |

### Graph (`/api/graph`)

| Method | Path | Parameters | Purpose |
|---|---|---|---|
| `GET` | `/api/graph` | `sync_ids` (comma-separated UUIDs, required) | Merged graph snapshot |
| `GET` | `/api/graph/nodes/{node_id:path}` | `sync_id?` | Node detail + AGE neighbors |
| `GET` | `/api/graph/nodes/{node_id:path}/summary` | `sync_id?`, `force?` | Enriched summary (cached) |
| `GET` | `/api/graph/nodes/{node_id:path}/file` | `sync_id?` | Reconstructed full file content |
| `GET` | `/api/graph/stats` | — | Platform-wide node/edge counts |
| `GET` | `/api/graph/search` | `q`, `type?`, `limit?` | Vector similarity search |

### Sources (`/api/sources`) — read side

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/sources` | Cursor-paginated list |
| `POST` | `/api/sources` | Upsert-on-conflict create |
| `GET` | `/api/sources/{source_id}` | Single source |
| `PATCH` | `/api/sources/{source_id}` | Update `config` JSONB |
| `DELETE` | `/api/sources/{source_id}` | Delete (cascades) |

### Syncs (`/api/syncs`) — read side

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/syncs` | Cursor-paginated list, filter by `source_id`/`status` |
| `GET` | `/api/syncs/{sync_id}` | Single sync run |
| `GET` | `/api/syncs/{sync_id}/issues` | Issues for a sync, filter by `level`/`phase` |

### Schedules (`/api/schedules`) — read side

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/schedules` | List, filter by `source_id` |

---

## Key modules

### `store.py`

Database access layer.

- **Pool management** — `connect()` / `disconnect()` around `asyncpg.create_pool`
- **AGE init** — every new connection runs `LOAD 'age'` and the pool's `server_settings` sets `search_path=ag_catalog,public` (survives `RESET ALL` on connection release)
- **Dataclasses** — `GraphNode`, `GraphEdge`, `GraphSnapshot`
- **Cytoscape helpers** — convert dataclasses to `{"data": {...}}` for the frontend
- **`get_stats()`** — counts `nodes_by_type` / `total_nodes` from `file_embeddings`; `total_edges` comes from AGE
- **`search(query_vector, type, limit)`** — `embedding <=> $1` cosine distance over `file_embeddings`
- **`ensure_node_summary(node_id, sync_id, force)`** — thin wrapper that validates the node and delegates to `enriched_summary.generate_enriched_summary`, returning the cached `description` if present and `force=false`

### `snapshot_query.py`

The merged-graph read model.

- **`get_merged_graph(sync_ids)`**
  1. Validates UUIDs
  2. SQL window function picks the latest version of each file across requested syncs
  3. Detects divergence (different `content_hash` across syncs → `divergent: true`)
  4. Returns Cytoscape-style nodes
  5. Queries AGE for `depends_on` edges, deduplicates, aggregates across syncs

- **`get_node_detail(node_id, sync_id=None)`**
  1. Parses `src_<source_id>:<file_path>` identifier
  2. Resolves latest sync if not provided
  3. Returns full metadata + AGE neighbors (with their actual edge labels, e.g. `depends_on`, `defines`)

### `enriched_summary.py`

The dense-LLM summary pipeline. See "Enriched summary" section below.

### `file_reconstruct.py`

`reconstruct_chunks(chunks, cap_bytes=5_242_880)` — concatenates `content_chunks` rows in `chunk_index` order with **line-overlap dedup**: because the chunker emits overlapping lines between consecutive chunks (legacy fallback behavior; AST chunker has no overlap), the reconstruction drops any prefix of chunk N whose line numbers overlap chunk N-1's `end_line`. Returns `{"content": …, "chunk_count": N, "truncated": bool}`.

Cap is 5 MB; oversized files are returned with `truncated=True`.

### `routes.py`

HTTP handlers for the `/api/graph` endpoints.

- `_embed_query(query)` — prefixes with `search_query: `, calls the embedding LLM, returns a 896-dim vector
- `GET /api/graph` — delegates to `snapshot_query.get_merged_graph`
- `GET /api/graph/nodes/{id}` — delegates to `snapshot_query.get_node_detail`
- `GET /api/graph/nodes/{id}/summary` — delegates to `store.ensure_node_summary`
- `GET /api/graph/nodes/{id}/file` — delegates to `reconstruct_chunks`
- `GET /api/graph/stats` — delegates to `store.get_stats`
- `GET /api/graph/search` — embeds query, delegates to `store.search`

### `sources.py`, `syncs.py`, `schedules.py`

Read endpoints with cursor-based pagination; write routing is the gateway's concern.

---

## Enriched summary pipeline

**File:** `services/graph/src/graph/enriched_summary.py`.

### Input sources

1. **Full file reconstruction** — all `content_chunks` for the node, passed through `reconstruct_chunks` (line-overlap dedup).
2. **Top-K edge neighbors** — `_fetch_edge_neighbors()` queries AGE with a short `SET LOCAL statement_timeout = '10000ms'` wrapper (so a stuck plan can't starve the pool). Returns `(neighbor_id, edge_type, direction)` triples.
3. **Per-neighbor context** — neighbor row from `file_embeddings` (`name`, `file_path`, `type`, `description`, `embedding`) + first 8 lines of its first `content_chunks` row (best-effort).
4. **Ranking** — `rank_neighbors_by_similarity(source_emb, neighbors, k=10)` computes cosine similarity vs the source file's embedding and keeps top-K.

### Prompt assembly (`assemble_prompt`)

```
# File  <file_path>  (<language>, <line_count> lines)

<full file content — truncated to 88% of total_budget_chars>

# Graph context (top-K by embedding similarity)

## depends_on (out)
- <neighbor.name>  (<neighbor.type>)
  description: <cached description or '—'>
  first-lines: <first 8 lines of first chunk, capped at neighbor_chars>

## defines (in)
- ...

Return a short paragraph summary.
```

Budgets:

| Setting | Default |
|---|---|
| `summary_total_budget_chars` | 100 000 |
| `summary_file_budget_ratio` | 0.88 |
| `summary_neighbor_budget_ratio` | 0.10 |
| `summary_neighbor_chars` | 1 200 (per neighbor cap) |
| `summary_edge_neighbors` | 10 (top-K) |

### LLM call

```json
POST http://host.docker.internal:8102/v1/chat/completions
{
  "model": "dense",
  "messages": [
    {"role": "system", "content": "You are summarizing a source-code node in a project graph..."},
    {"role": "user",   "content": "<assembled prompt>"}
  ],
  "temperature": 0.2,
  "max_tokens": 400,
  "chat_template_kwargs": {"enable_thinking": false}
}
```

`enable_thinking: false` is critical — Qwen-family reasoning models would otherwise burn the decode budget on internal reasoning and return empty `content`.

### Context-overflow retry

On HTTP 400 with a context-window error, the caller retries at `[1.0, 0.5, 0.25]` budget scales. Only after exhausting all three does the pipeline return `source="llm_failed"`.

### Caching

Successful responses persist into `file_embeddings.description` + `description_generated_at = now()`. Subsequent calls with `force=false` return the cached text without invoking the dense LLM.

---

## Apache AGE integration

- **Graph:** `substrate`
- **Node type:** `:File` with properties `file_id`, `sync_id`, `source_id`, `name`, `type`, `domain`
- **Edge types:** `depends_on` (file-to-file), `defines` (file-to-symbol)
- **Symbol nodes:** `:Symbol` vertices for named constructs (function / class / method) — written by ingestion and surfaced via node-detail neighbors

The merged-graph snapshot query always serializes edges with `label = "depends_on"` for frontend stability; node-detail returns the real `label(r)` so the UI can distinguish `depends_on` vs `defines` vs future edge types.

---

## Snapshot divergence detection

A node is marked `divergent: true` when the same `(source_id, file_path)` appears in multiple requested syncs with different `content_hash` values. Enables branch-comparison / change-tracking.

```json
{
  "data": {
    "id": "src_550e8400-...:src/main.py",
    "name": "main.py",
    "type": "source",
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

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://substrate_graph:...@postgres:5432/substrate_graph` | Postgres connection |
| `EMBEDDING_URL` | `http://host.docker.internal:8101/v1/embeddings` | Embedding LLM |
| `EMBEDDING_MODEL` | `embeddings` | lazy-lamacpp systemd-unit name |
| `EMBEDDING_DIM` | `896` | Enforced by startup guard |
| `DENSE_LLM_URL` | `http://host.docker.internal:8102/v1/chat/completions` | Dense LLM |
| `DENSE_LLM_MODEL` | `dense` | lazy-lamacpp systemd-unit name |
| `LLM_API_KEY` | `test` | Bearer token for both endpoints (empty skips header) |
| `SUMMARY_MAX_TOKENS` | `400` | Max tokens for summary output |
| `SUMMARY_TOTAL_BUDGET_CHARS` | `100000` | Total prompt budget |
| `SUMMARY_FILE_BUDGET_RATIO` | `0.88` | File portion of total budget |
| `SUMMARY_NEIGHBOR_BUDGET_RATIO` | `0.10` | Combined neighbor portion |
| `SUMMARY_NEIGHBOR_CHARS` | `1200` | Per-neighbor block cap |
| `SUMMARY_EDGE_NEIGHBORS` | `10` | Top-K for neighbor ranking |
| `GRAPH_QUERY_TIMEOUT_SECONDS` | `60` | AGE read wall-clock cap |
| `APP_PORT` | `8082` | FastAPI port inside the container |

No `SUMMARY_CHUNK_SAMPLE_CHARS` — the old "first 5 chunks capped at 4000 chars" approach has been replaced by the full-file + top-K-neighbors pipeline above.

---

## `content_chunks.embedding` — currently populated, not yet queried

Ingestion writes 896-dim chunk embeddings on every sync. **No graph-service endpoint reads them today.** It's compute + storage without user-visible effect, retained for unified chunk-level search / RAG expansion — see the project roadmap for P2 search unification. Readers should not assume this column is used anywhere unless they see it referenced in `services/graph/src/` directly.

---

## Performance characteristics

| Operation | Typical latency | Notes |
|---|---|---|
| Merged graph query | 50-500 ms | Depends on snapshot size |
| Node detail | 20-100 ms | AGE neighbor query |
| Semantic search | 100-500 ms | Embed + pgvector |
| Enriched summary | 5-60 s | Dense LLM prefill + decode; file-heavy files sit at the high end |
| Stats | 10-50 ms | Simple counts |

---

## Test coverage

| Test file | What it covers |
|---|---|
| `test_store.py` | Dataclasses, Cytoscape conversion |
| `test_snapshot_query.py` | Divergence detection in merged graphs |
| `test_sources_api.py` | Source CRUD end-to-end |
| `test_syncs_api.py` | Sync/schedule listing |
| `test_summary_enriched.py` | Ranking, prompt assembly, HTTP wiring (dense LLM mocked) |
| `test_startup_embedding_dim_guard.py` | Dim column mismatch detection |
| `test_file_reconstruct.py` | Line-overlap dedup in reconstruction |

Some tests need real Postgres + AGE + pgvector and run via `testcontainers-python`.
