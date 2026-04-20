# Migrations

Substrate uses **Flyway** for PostgreSQL schema migrations. Migrations are applied automatically when services start via Docker Compose.

---

## Migration Files

### Graph Service

**Location:** `services/graph/migrations/postgres/`

| File | Description |
|------|-------------|
| `V1__initial_schema.sql` | Creates all relational tables for the graph service |

This migration creates:
- `sources` — connected repositories
- `sync_runs` — ingestion execution records
- `sync_issues` — structured warnings/errors per sync
- `sync_schedules` — periodic sync configuration
- `file_embeddings` — file metadata + vector embeddings
- `content_chunks` — text chunks + vector embeddings

### Ingestion Service

**Location:** `services/ingestion/migrations/`

| File | Description |
|------|-------------|
| `V1__ingestion_schema.sql` | Creates ingestion-internal event tables |

This migration creates:
- `raw_events` — incoming webhook/API events before normalization
- `graph_events` — normalized graph events pending downstream processing

**Note:** The current implementation writes directly to the shared PostgreSQL + AGE database. The `raw_events` and `graph_events` tables exist but are not actively used in the current sync pipeline.

---

## How Migrations Run

The `compose.yaml` injects Flyway environment variables into each service:

```yaml
# Ingestion service
environment:
  FLYWAY_URL: jdbc:postgresql://host.docker.internal:5432/substrate_ingestion
  FLYWAY_USER: substrate_ingestion
  FLYWAY_PASSWORD: ${INGESTION_DB_PASSWORD}

# Graph service
environment:
  FLYWAY_URL: jdbc:postgresql://host.docker.internal:5432/substrate_graph
  FLYWAY_USER: substrate_graph
  FLYWAY_PASSWORD: ${GRAPH_DB_PASSWORD}
```

Each service Dockerfile includes a startup step that runs `flyway migrate` before starting the FastAPI application.

---

## Adding a New Migration

1. Create a new SQL file in the appropriate `migrations/` directory
2. Follow Flyway naming convention: `V{version}__{description}.sql`
3. Ensure the migration is idempotent (use `IF NOT EXISTS` where appropriate)
4. Test locally by restarting the service container

---

## AGE and pgvector Setup

The `age` and `vector` extensions, plus the `substrate` AGE graph, are created by the `home-stack` init script (`01-init-databases.sh`) running as the PostgreSQL superuser. They are **not** managed by service-level Flyway migrations.
