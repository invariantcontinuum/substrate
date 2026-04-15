# Ingestion Service

**Port:** 8081  
**Language:** Python 3.12 / FastAPI  
**Repository:** `services/ingestion/`

---

## Overview

The Ingestion Service orchestrates the extraction, parsing, embedding, and graph-persistence of external source code repositories. It is the **write path** of the Substrate platform.

---

## Responsibilities

1. **Source Materialization**: Clone/download repositories into temporary scratch space
2. **File Discovery & Classification**: Walk the repository tree and classify every file
3. **Static Import Analysis**: Parse file contents to extract cross-file dependencies
4. **Chunking & Embedding**: Split contents into chunks and generate vector embeddings
5. **Graph Persistence**: Write nodes and edges into Apache AGE and PostgreSQL
6. **Sync Lifecycle Management**: Create, cancel, retry, clean, and purge sync jobs
7. **Scheduling**: Poll for due schedules and automatically enqueue periodic syncs

---

## Architecture

```mermaid
flowchart TB
    subgraph Sources["Data Sources"]
        GH[GitHub API / git clone]
    end

    subgraph Ingestion["Ingestion Service"]
        API[FastAPI Server]
        RUNNER[Job Runner]
        SCHED[Scheduler]
        CONN[GitHub Connector]
        SYNC[Sync Orchestrator]
    end

    subgraph Storage
        PG[(PostgreSQL)]
        AGE[Apache AGE]
    end

    GH -->|clone| CONN
    CONN -->|MaterializedTree| SYNC
    SYNC -->|write| PG
    SYNC -->|write| AGE

    API -->|create| RUNNER
    SCHED -->|trigger| RUNNER
    RUNNER -->|dispatch| SYNC
```

---

## Key Modules

| Module | Responsibility |
|--------|----------------|
| `main.py` | FastAPI app factory, lifespan management, REST endpoints |
| `config.py` | Pydantic `BaseSettings` — database URLs, GitHub token, embedding config |
| `db.py` | Asyncpg pool factory for the ingestion database |
| `schema.py` | Pydantic models: `GraphEvent`, `FileMetadata`, request DTOs |
| `chunker.py` | Line-aware text chunker with configurable size/overlap |
| `graph_writer.py` | Graph + relational write layer with batching and fallback |
| `llm.py` | HTTP client to the local `/v1/embeddings` endpoint |
| `scheduler.py` | Polls every 30s, claims due schedules atomically |
| `sync_runs.py` | Single source of truth for sync row lifecycle |
| `sync_issues.py` | Records structured issues per sync (capped at 1,000) |
| `sync_schedules.py` | CRUD + `claim_due_schedules()` |
| `connectors/base.py` | `SourceConnector` protocol |
| `connectors/github.py` | GitHub-specific connector |
| `jobs/runner.py` | Polls for pending syncs and dispatches them |
| `jobs/sync.py` | The actual sync orchestrator |

---

## The GitHub Connector

**File:** `src/connectors/github.py`

### How It Works

The `GitHubConnector` shallow-clones repositories via `git clone --depth 1` and returns a `MaterializedTree` containing all files.

### What It Ingests

All files (blobs) from the repository tree. Directories are excluded.

### File Classification

`classify_file_type()` categorizes files into:

| Type | Extensions |
|------|------------|
| `source` | `.c`, `.py`, `.go`, `.rs`, `.ts`, `.js`, `.java`, etc. |
| `config` | `.yaml`, `.json`, `.toml`, `Makefile`, `Dockerfile`, etc. |
| `script` | `.sh`, `.bash`, `.ps1`, etc. |
| `doc` | `.md`, `.rst`, `.txt`, `LICENSE`, etc. |
| `data` | `.csv`, `.tsv`, `.sql` |
| `asset` | Images, fonts |
| `service` | Fallback for unrecognized extensions |

### Import Parsing

`parse_imports()` uses regex patterns per language to find local dependencies:

| Extensions | Pattern |
|------------|---------|
| `.c`, `.h`, `.cpp`, `.hpp` | `#include "..."` |
| `.py` | `from X import Y` / `import X` |
| `.js`, `.jsx`, `.ts`, `.tsx` | `import ... from '...'` / `require('...')` |
| `.go` | `import "..."` |
| `.rs` | `use crate::...` / `mod ...` |
| `.pl`, `.pm` | `use ...` / `require '...'` |
| `.sh`, `.bash` | `source ...` / `. ...` |
| `.cmake` | `include(...)` / `find_package(...)` |

Only resolved local files become edges with `type="depends"`.

---

## Sync Job Lifecycle

### Status Values

```
pending -> running -> completed
                 -> failed
                 -> cancelled -> cleaned
```

### State Machine (`sync_runs.py`)

- **Partial unique index**: Guarantees only one active (`pending` or `running`) sync per source
- `create_sync_run()`: Inserts `pending` row
- `claim_sync_run()`: Atomically updates `pending` → `running`
- `ensure_active_sync()`: Returns existing active sync or creates new (used by scheduler)
- `complete_sync_run()`, `fail_sync_run()`, `cancel_sync_run()`: Terminal transitions

### Runner (`jobs/runner.py`)

- Polls every 2 seconds for up to 5 `pending` syncs
- Spawns `asyncio.create_task(handle_sync(...))` for each
- Graceful shutdown with 30s timeout for in-flight tasks

### Scheduler (`scheduler.py`)

- Polls every 30 seconds
- Claims due schedules atomically (`FOR UPDATE SKIP LOCKED`)
- Calls `ensure_active_sync()` for each due schedule

### Sync Orchestrator (`jobs/sync.py`)

The `handle_sync()` pipeline:

1. **Materialize** — connector clones repo to temp dir
2. **Discover** — walk tree, build `NodeAffected` list
3. **Parse** — read files, extract import edges
4. **Prepare** — build metadata: language, line count, SHA-256, summary text, chunks
5. **Graphing** — write `file_embeddings` and `content_chunks` (without embeddings), then write AGE nodes/edges
6. **Embed summaries** — batch-embed file summaries, backfill `file_embeddings.embedding`
7. **Embed chunks** — batch-embed chunk contents, backfill `content_chunks.embedding`
8. **Done** — mark complete, update `sources.last_sync_id`

Cancellation is checked every 50 files. On cancellation, partial data is cleaned up.

---

## Graph Writer Batching

**File:** `src/graph_writer.py`

### Batch Strategy

`write_age_nodes()` and `write_age_edges()` use a `CHUNK_SIZE = 500` strategy:

1. **UNWIND chunk attempt** — builds a single Cypher `UNWIND [...] AS r CREATE ...` for up to 500 rows
2. **Per-row fallback** — if the chunk fails (e.g., due to `$$` breaking dollar-quoting), falls back to individual `CREATE` statements

### Relational Writes

- `ensure_source()`: Idempotent insert-or-update for `sources`
- `insert_file()`: Insert into `file_embeddings`
- `insert_chunks()`: Insert into `content_chunks`
- `update_file_embedding()`: Backfill embedding after batch generation
- `update_chunk_embedding()`: Backfill chunk embedding

### Cleanup

`cleanup_partial(sync_id)`:
- `MATCH (n) WHERE n.sync_id = '...' DETACH DELETE n` in AGE
- `DELETE FROM file_embeddings WHERE sync_id = ...` (chunks cascade via FK)

---

## Chunking & Embedding

### Chunking (`chunker.py`)

- **Line-aware sliding window**: Splits by newlines, accumulates token estimates
- **Overlap**: After emitting a chunk, walks backward to create overlap
- **Token heuristic**: `len(text.split()) * 1.3`
- Defaults: `chunk_size=512`, `chunk_overlap=64`

### LLM Client (`llm.py`)

- Talks to local llama-cpp at `settings.embedding_url`
- **Truncation**: Inputs truncated to 6,000 characters before sending
- **Batch embedding**: The sync orchestrator (`jobs/sync.py`) batches up to 32 texts (`EMBED_BATCH_SIZE = 32`) before calling `llm.embed_batch()`
- **Recursive bisect on 400**: If a batch gets HTTP 400, splits in half and retries each half

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/syncs` | POST | Create new sync |
| `/api/syncs/{sync_id}/cancel` | POST | Cancel sync |
| `/api/syncs/{sync_id}/retry` | POST | Retry failed sync |
| `/api/syncs/{sync_id}/clean` | POST | Clean completed/failed/cancelled sync |
| `/api/syncs/{sync_id}` | DELETE | Purge sync and all data |
| `/api/schedules` | POST | Create schedule |
| `/api/schedules/{schedule_id}` | PATCH | Update schedule (interval, enabled, overrides) |
| `/api/schedules/{schedule_id}` | DELETE | Delete schedule |

---

## Configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| `database_url` | `postgresql+asyncpg://substrate_ingestion:changeme@local-postgres:5432/substrate_ingestion` | Ingestion DB |
| `graph_database_url` | `postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph` | Shared graph DB |
| `github_token` | `""` | PAT for GitHub API and clone auth |
| `app_port` | `8081` | FastAPI listen port |
| `embedding_url` | `http://localhost:8101/v1/embeddings` | Embedding endpoint |
| `embedding_model` | `Qwen3-Embedding-0.6B-Q8_0.gguf` | Model name |
| `embedding_dim` | `1024` | Must match served model |
| `chunk_size` | `512` | Target tokens per chunk |
| `log_level` | `INFO` | Structlog filter level |
| `chunk_overlap` | `64` | Tokens to overlap |

---

## Test Coverage

| Test File | What It Covers |
|-----------|----------------|
| `test_schema.py` | Pydantic model validation |
| `test_github.py` | Tree parsing and import extraction |
| `test_graph_writer_batching.py` | Chunked AGE writes with fallback |
| `test_graph_writer_integration.py` | Real AGE integration (2,500 nodes) |
| `test_cleanup.py` | Cleanup and idempotency |
| `test_sync_runs.py` | Full sync lifecycle |
| `test_ensure_active_sync.py` | Race-condition safety |
| `test_sync_issues.py` | Issue capping behavior |
| `test_scheduler.py` | Schedule-driven sync creation |

**Gaps:**
- No direct tests for `jobs/sync.py` (the main orchestrator)
- No tests for `llm.py` embedding client
- No tests for `chunker.py`

---

## Ingestion Database Tables

The ingestion service maintains its own PostgreSQL database (`substrate_ingestion`) with Flyway-managed migrations.

### `raw_events`

Buffers incoming webhook/API events before normalization.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `source` | text | Event source (e.g., `github`) |
| `event_type` | text | Event type |
| `payload` | JSONB | Raw event payload |
| `received_at` | timestamptz | |

### `graph_events`

Stores normalized graph events pending downstream processing.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `source` | text | Event source |
| `event_type` | text | Event type |
| `nodes_affected` | JSONB | |
| `edges_affected` | JSONB | |
| `published` | bool | Default `false` |
| `created_at` | timestamptz | |

**Note:** These tables are part of the schema but are not actively used by the current clone-based sync pipeline, which writes directly to the shared graph database.
