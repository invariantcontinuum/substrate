# Ingestion Service

**Host port:** 8181 (debug)
**Container port:** 8081
**Language:** Python 3.12 / FastAPI
**Repository:** `services/ingestion/`

---

## Overview

The Ingestion Service orchestrates the extraction, parsing, chunking, embedding, and graph-persistence of external source code repositories. It is the **write path** of the Substrate platform.

All writes go to the single `substrate_graph` database — there is no separate ingestion database. Parsing, symbol extraction, and chunking are delegated to the `substrate-graph-builder` package (tree-sitter-backed, 15 languages + markdown + text).

---

## Responsibilities

1. **Source materialization** — clone repositories into scratch space
2. **File discovery + classification** — walk the tree, classify every file
3. **Tree-sitter parsing** — extract imports and symbols via `substrate-graph-builder` plugins
4. **AST/semantic chunking** — split files by construct boundaries; embed breadcrumb headers
5. **Graph persistence** — write nodes and edges into Apache AGE + `file_embeddings` + `content_chunks`
6. **Embedding** — batch-embed file summaries and chunks against lazy-lamacpp
7. **Sync lifecycle** — create, cancel, retry, clean, purge
8. **Scheduling** — poll `sync_schedules` and enqueue due periodic syncs

---

## Architecture

```mermaid
flowchart TB
    subgraph Sources
        GH[GitHub / git clone]
    end

    subgraph Ingestion
        API[FastAPI app]
        RUNNER[Job runner]
        SCHED[Scheduler]
        CONN[GitHub connector]
        SYNC[Sync orchestrator]
        GB[substrate-graph-builder<br/>tree-sitter plugins + chunker]
    end

    subgraph Storage
        PG[(substrate_graph)]
        AGE[Apache AGE]
    end

    subgraph AI
        EMB[Embedding LLM :8101]
    end

    GH -->|clone| CONN
    CONN -->|MaterializedTree| SYNC
    SYNC -->|parse + chunk| GB
    GB -->|imports, symbols, chunks| SYNC
    SYNC -->|write| PG
    SYNC -->|write| AGE
    SYNC -->|embed| EMB
    EMB -->|vectors| SYNC
    SYNC -->|backfill| PG

    API -->|create| RUNNER
    SCHED -->|claim due| RUNNER
    RUNNER -->|dispatch| SYNC
```

---

## Key modules

| Module | Responsibility |
|---|---|
| `main.py` | FastAPI app factory, lifespan, REST endpoints |
| `config.py` | Pydantic `BaseSettings` (database URL, embedding config, chunk params) |
| `graph_writer.py` | Batched AGE writes + relational inserts + embedding backfills |
| `chunker.py` | Thin shim that delegates to `substrate_graph_builder.chunker.chunk_content` |
| `llm.py` | HTTP client to the embedding endpoint — batch embed with bisect-on-failure |
| `scheduler.py` | 30 s poller that claims due schedules atomically |
| `sync_runs.py` | Single source of truth for sync row lifecycle |
| `sync_issues.py` | Records structured issues per sync (capped at 1,000) |
| `sync_schedules.py` | CRUD + `claim_due_schedules()` |
| `connectors/base.py` | `SourceConnector` protocol |
| `connectors/github.py` | GitHub connector: shallow clone, tree walk |
| `jobs/runner.py` | Poll loop — claims `pending` syncs and dispatches |
| `jobs/sync.py` | The sync orchestrator (`handle_sync()`) |
| `events.py` | SSE-event writers (`publish_sync_lifecycle`, `publish_sync_progress`, …) |

---

## The GitHub connector

**File:** `src/connectors/github.py`

The `GitHubConnector` shallow-clones repositories via `git clone --depth 1` using a per-source PAT from `sources.config`, and returns a `MaterializedTree` with all file blobs.

### File classification

`classify_file_type()` (in substrate-graph-builder) categorizes files into:

| Type | Examples |
|---|---|
| `source` | `.c`, `.py`, `.go`, `.rs`, `.ts`, `.js`, `.java`, `.kt`, `.rb`, `.cs`, `.php`, … |
| `config` | `.yaml`, `.json`, `.toml`, `Makefile`, `Dockerfile`, `CMakeLists.txt` |
| `script` | `.sh`, `.bash`, `.ps1`, … |
| `doc` | `.md`, `.rst`, `.txt`, `LICENSE`, … |
| `data` | `.csv`, `.tsv`, `.sql` |
| `asset` | Images, fonts, binaries |
| `service` | Fallback for unrecognized extensions |

### Import parsing

Imports are extracted via **tree-sitter** plugins in `packages/substrate-graph-builder/src/substrate_graph_builder/plugins/` — not regex. Each plugin declares a grammar name plus a tree-sitter query string (`imports_query`, `symbols_query`) and a `resolve()` method to turn raw import strings into file paths.

Currently supported languages: C, C++, C#, CMake, Go, Java, JavaScript, Kotlin, Perl, PHP, Python, Ruby, Rust, Shell, TypeScript.

Only imports that resolve to a known file in the repo become edges with `type="depends"` in AGE.

---

## Chunking

**File:** `services/ingestion/src/chunker.py` (thin shim over `substrate_graph_builder.chunker`).

The chunker is AST-aware for code, semantic for prose, line-greedy for unknown file types. Four strategies are dispatched by file extension:

| File type | Strategy | Source |
|---|---|---|
| Any with a graph-builder plugin | Tree-sitter AST walker, per-construct chunks | `chunker/ast.py` |
| `.md` / `.markdown` / `.mdx` | Heading-aware, fence-preserving | `chunker/markdown.py` |
| `.txt` / `.rst` / `.adoc` | Paragraph packer | `chunker/text.py` |
| Everything else | Line-greedy | `chunker/fallback.py` |

### AST walker behavior

1. Walk `root.children` → one chunk per top-level named construct
2. Oversized constructs recurse into named children
3. Leaves still oversized fall through to line-greedy within the node's byte range
4. Adjacent siblings merge up to budget, but **never blend two distinct non-"block" constructs** (e.g. function + class stay separate)
5. `chunk_type` populated from the tree-sitter node type (function / method / class / struct / impl / trait / module / namespace / block)
6. `symbols` populated with the construct's identifier via `child_by_field_name("name")`

### Breadcrumb headers

Every chunk (regardless of strategy) is prefixed with a contextual header so the embedding model sees the chunk's position in the file:

```
# file: services/graph/src/api/routes.py
# in: MyClass > my_method

<chunk body>
```

The header is included in `token_count`.

### Defaults

```python
chunk_size = 512     # target tokens per chunk
chunk_overlap = 64   # tokens; applied only in fallback / markdown / text paths.
                     # AST path relies on breadcrumbs instead of overlap.
estimator = words × 1.3
```

---

## Embedding (`llm.py`)

### File summary path (ingestion's own summary, not the dense LLM enrichment)

`services/ingestion/src/chunker.py::file_summary_text` produces:

```
path: <file_path>
type: <source|test|config|...>
language: <python|typescript|...>

<first 100 lines of file>
```

This string is what gets embedded into `file_embeddings.embedding` — not the chunk bodies.

### Embedding request shape

Every input is prefixed with `search_document: ` and hard-truncated to 1400 characters before sending:

```
POST http://host.docker.internal:8101/v1/embeddings
{
  "model": "embeddings",
  "input": "search_document: <body truncated to 1400 - prefix chars>"
}
```

The matching `search_query: ` prefix is used by the graph service's search endpoint so corpus and queries cluster in the same embedding space.

### Batching + bisect-on-failure

- `embed_batch(texts)` sends up to `EMBED_BATCH_SIZE = 32` inputs per HTTP call
- On HTTP 400 / 500 (commonly "request exceeds batch size"), the batch is bisected recursively
- At batch size 1, a final 40 % re-truncation is attempted before giving up and recording `None` for that input
- `None` slots skip the backfill — the chunk row keeps a null `embedding` and a `sync_issues` warning is recorded

### Dim guard

`assert_embedding_dim()` checks every returned vector against `EMBEDDING_DIM = 896`; mismatches raise `EmbeddingDimError` with sync_id and expected/actual dimensions.

---

## Sync job lifecycle

### Status state machine

```
pending → running → completed
                ↘ failed
                ↘ cancelled → cleaned
```

A partial unique index on `sync_runs` guarantees only one active (`pending` or `running`) sync per source.

Key functions in `sync_runs.py`:

- `create_sync_run()` — insert `pending` row
- `claim_sync_run()` — atomically flip `pending → running`
- `ensure_active_sync()` — return existing active or create new (used by scheduler)
- `complete_sync_run()`, `fail_sync_run()`, `cancel_sync_run()` — terminal transitions

Each transition publishes a `sync_lifecycle` SSE event with `source_id` attached (so frontends can filter).

### Runner (`jobs/runner.py`)

- Polls every 2 s, fetches up to 5 `pending` syncs per iteration
- Spawns `asyncio.create_task(handle_sync(...))` per sync
- Survives per-iteration failures (DNS hiccup at first boot is common and self-recovers)
- Graceful shutdown with 30 s timeout for in-flight tasks

### Scheduler (`scheduler.py`)

- Polls every 30 s
- Claims due schedules atomically via `FOR UPDATE SKIP LOCKED`
- Calls `ensure_active_sync()` per due schedule

### Sync orchestrator (`jobs/sync.py`)

`handle_sync()` phases (progress + phase propagated via `publish_sync_progress` SSE events):

1. **materialize** — connector clones repo to temp dir
2. **discover** — walk tree, build `NodeAffected` list
3. **parse** — tree-sitter plugins extract imports + symbols
4. **prepare** — per-file metadata: language, line count, SHA-256, summary string, chunks
5. **graphing** — write `file_embeddings` + `content_chunks` (embeddings null), then AGE `:File` nodes + `depends_on` + `defines` edges
6. **embedding_summaries** — batch-embed file summaries, backfill `file_embeddings.embedding`
7. **embedding_chunks** — batch-embed chunk contents, backfill `content_chunks.embedding`
8. **done** — mark `completed`, update `sources.last_sync_id`

Cancellation is checked every 50 files. On cancel, `cleanup_partial(sync_id)` removes AGE nodes and `file_embeddings` rows (chunks cascade).

---

## Graph writer (`graph_writer.py`)

### AGE batch writes

`write_age_nodes()` and `write_age_edges()` use `CHUNK_SIZE = 500`:

1. **UNWIND batch attempt** — builds a single Cypher `UNWIND [...] AS r CREATE ...` for 500 rows
2. **Per-row fallback** — on batch failure (rare; e.g. `$$` breaking dollar-quoting), fall back to individual CREATE statements

### Relational writes

- `ensure_source()` — idempotent insert-or-update
- `insert_file()` — insert into `file_embeddings`
- `insert_chunks()` — insert into `content_chunks` (writes `chunk_type`, `symbols`, `language`, `embedding=null`)
- `update_file_embedding(file_id, vec)` — backfill file vector
- `update_chunk_embedding(file_id, chunk_index, vec)` — backfill chunk vector

### Cleanup

`cleanup_partial(sync_id)`:
- `MATCH (n {sync_id: '...'}) DETACH DELETE n` in AGE
- `DELETE FROM file_embeddings WHERE sync_id = ...` (content_chunks cascade via FK)

---

## API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/api/syncs` | POST | Create new sync |
| `/api/syncs/{sync_id}/cancel` | POST | Cancel sync |
| `/api/syncs/{sync_id}/retry` | POST | Retry failed sync |
| `/api/syncs/{sync_id}/clean` | POST | Clean completed/failed/cancelled sync |
| `/api/syncs/{sync_id}` | DELETE | Purge sync and all data |
| `/api/schedules` | POST | Create schedule |
| `/api/schedules/{schedule_id}` | PATCH | Update (interval, enabled, overrides) |
| `/api/schedules/{schedule_id}` | DELETE | Delete |

Reads for `sources`, `syncs`, `schedules` live in the **graph service**, not here — the gateway routes them by method/path.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://substrate_graph:...@postgres:5432/substrate_graph` | Single DB |
| `APP_PORT` | `8081` | FastAPI port inside the container |
| `EMBEDDING_URL` | `http://host.docker.internal:8101/v1/embeddings` | Embedding endpoint |
| `EMBEDDING_MODEL` | `embeddings` | lazy-lamacpp systemd-unit name |
| `EMBEDDING_DIM` | `896` | Must match `V*__embedding_dim_*.sql` |
| `LLM_API_KEY` | `test` | Bearer token for the LLM endpoint (empty to skip auth header) |
| `SERVICE_LOG_PRETTY` | `0` | Set to `1` for developer-readable logs |

Chunker parameters (`chunk_size=512`, `chunk_overlap=64`) live in the shim for backwards compatibility; the real defaults are in `substrate_graph_builder.chunker`.

---

## Testing

| Test file | What it covers |
|---|---|
| `test_graph_writer_batching.py` | Chunked AGE writes with per-row fallback |
| `test_graph_writer_integration.py` | Real AGE integration (2 500 nodes) |
| `test_cleanup.py` | Cleanup idempotency |
| `test_sync_runs.py` | Full sync lifecycle |
| `test_ensure_active_sync.py` | Race-condition safety |
| `test_sync_issues.py` | Issue capping |
| `test_scheduler.py` | Schedule-driven creation |
| `test_retention.py` | Retention sweep |
| `test_embedding_dim_guard.py` | Dim mismatch detection |
| `packages/substrate-graph-builder/tests/test_chunker.py` | AST / markdown / text / fallback chunker invariants |

Most are integration tests using `testcontainers-python` against a real Postgres + AGE + pgvector. `make test` runs the full suite.
