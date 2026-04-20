# Infrastructure

Substrate's infrastructure layer is deliberately spartan: **one Postgres instance** (with AGE + pgvector), **one Keycloak instance**, and **two llama.cpp workers** for local AI. Prod TLS is handled upstream by home-stack's nginx-proxy-manager — substrate bundles no reverse proxy of its own.

---

## Overview

| Component | Technology | Host port | Purpose |
|---|---|---|---|
| Primary DB | PostgreSQL 16 | 5432 | Relational, graph, embeddings, SSE |
| Graph extension | Apache AGE | — | Cypher inside Postgres |
| Vector extension | pgvector | — | 896-dim embeddings |
| Identity | Keycloak 26 | 8080 | OIDC, JWT |
| AI inference | lazy-lamacpp | 8101 (embeddings), 8102 (dense) | Local LLM serving |
| DB admin | pgadmin 4 | 5050 | DB introspection |

---

## PostgreSQL

### Role

PostgreSQL is the **single source of truth** for all Substrate data:
- Relational metadata (sources, syncs, schedules, issues)
- Vector embeddings (`pgvector`)
- Graph topology (`Apache AGE`)
- SSE replay buffer (`sse_events` table)

### Databases

The Postgres instance hosts two logical databases:

| Database | Owner | Purpose |
|---|---|---|
| `substrate_graph` | `substrate_graph` | All substrate data (graph, chunks, embeddings, SSE) |
| `keycloak` | `keycloak` | Keycloak's own state |

There is **no `substrate_ingestion`** database. Ingestion and graph share `substrate_graph`.

### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS age;      -- Cypher
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector
```

### Connection pools

Every service uses `asyncpg` pools against `substrate_graph`:

- **Graph service** — default pool sizing
- **Ingestion service** — sized for heavy background writes, configured via asyncpg defaults; uses `UNWIND …` batching via `graph_writer.py::write_age_nodes/edges` (batches of 500 with per-row fallback) to avoid saturating the pool
- **Gateway** — a small pool used only for the SSE replay path (`sse_endpoint.py`), which does `SELECT … FROM sse_events WHERE id > $last`, then `LISTEN substrate_sse`

Every pool registers an `init` callback that runs `LOAD 'age'` and sets `server_settings={"search_path":"ag_catalog,public"}` so Cypher queries work on any pooled connection.

For high-scale prod, PgBouncer in front of Postgres is viable but not currently part of the default compose.

---

## Apache AGE

### Role

Apache AGE adds Cypher graph queries to Postgres as an extension. Substrate uses it instead of running a separate Neo4j server.

### Graph

```sql
SELECT * FROM ag_catalog.create_graph('substrate');
```

The graph is named **`substrate`** and holds `:File` vertices plus `depends_on` and `defines` edges. See `docs/architecture/data-model.md` for the schema.

### Cypher execution

```sql
SELECT * FROM cypher('substrate', $$
  MATCH (a:File)-[r:depends_on]->(b:File)
  WHERE r.sync_id IN ['uuid1', 'uuid2']
  RETURN a.file_id, b.file_id, r.weight
$$) AS (result agtype);
```

All pool connections run `LOAD 'age'` on init (and `search_path` is set via `server_settings`, not per-query, because `RESET ALL` on pool release wipes in-session `SET`s).

AGE expression indexes (migration V5) make `MATCH (f:File {file_id: '...'})` lookups logarithmic against the File vertex table.

---

## pgvector

### Role

Stores 896-dimensional embeddings produced by jina-code-embeddings-0.5b.

### Columns

| Table | Column | Type |
|---|---|---|
| `file_embeddings` | `embedding` | `vector(896)` |
| `content_chunks` | `embedding` | `vector(896)` |

### Search query

```sql
SELECT id, name, file_path, embedding <=> $1 AS distance
FROM file_embeddings
WHERE type = 'source'
ORDER BY embedding <=> $1
LIMIT 10;
```

The `<=>` operator computes cosine distance. The graph service uses this for `/api/graph/search`; the ingestion service only writes — no reads of embedding columns on the ingestion side.

Dim migrations are tracked in `services/graph/migrations/postgres/` (V4 → V7 → V8 → V9 → V10, currently at 896-dim). A startup guard (`services/graph/src/startup.py::check_embedding_dim`) verifies the column's declared dimension matches `EMBEDDING_DIM` and fails the graph service at boot on mismatch.

---

## Keycloak

### Role

Identity provider for OIDC authentication and JWT issuance.

### Realm

- **Realm:** `substrate` (imported from `ops/infra/keycloak/substrate-realm.json`, which is rendered from the committed template by `scripts/render-realm.py`)
- **Frontend client:** `substrate-frontend` — public, PKCE-S256
- **Gateway client:** `substrate-gateway` — confidential, service-accounts enabled (secret comes from `KC_GATEWAY_CLIENT_SECRET` in the active env file)
- **Issuer:** `${KC_HOSTNAME}/realms/substrate` (e.g. `http://localhost:8080/realms/substrate` in dev, `https://auth.<domain>/realms/substrate` in prod)
- **JWKS endpoint:** `${KC_HOSTNAME}/realms/substrate/protocol/openid-connect/certs`

### Command mode

- Dev: `start-dev --import-realm` with `KC_HOSTNAME_STRICT=false`
- Prod: `start --import-realm` with `KC_HOSTNAME_STRICT=true` and `KC_PROXY_HEADERS=xforwarded` so NPM-forwarded `X-Forwarded-Proto: https` is honored

### Token characteristics

- Algorithm: RS256
- JWKS cached in the gateway for 5 minutes with background refresh
- Audience verification is disabled in the gateway (`verify_aud=False`) — issuer + signature + expiry are enforced

---

## lazy-lamacpp (local AI inference)

Runs on the **host** via systemd-user units, not inside compose. Substrate's containers reach it via `host.docker.internal` — the one justified use of that host alias.

### Models currently served

| Role | Model | Port | Notes |
|---|---|---|---|
| embeddings | jina-code-embeddings-0.5b Q8_0 | 8101 | 896-dim, 32 k context |
| dense | Qwen3.5-2B Q8_0 | 8102 | 60 k context, used for enriched summaries |

Additional model roles (`sparse`, `reranker`, `coding`) are defined under `ops/llm/lazy-lamacpp/config/models/` but are on-demand only — the embeddings + dense pair is required concurrently.

### Starting / stopping / status

```bash
cd ops/llm/lazy-lamacpp
make start MODEL=embeddings
make start MODEL=dense
make status MODEL=embeddings
make status-all
make stop MODEL=embeddings
```

The top-level Substrate Makefile does **not** re-export these targets — manage lazy-lamacpp directly from its own Makefile.

### API compatibility

Both ports expose OpenAI-compatible endpoints:

- `POST /v1/embeddings`
- `POST /v1/chat/completions`

### VRAM budget

Both workers must fit simultaneously in the host's 4 GB VRAM (Quadro P1000 Mobile):

- Embeddings Q8_0 weights ≈ 600 MiB + KV cache with Q8_0 quantization ≈ 500 MiB → ~1.1 GB
- Dense Q8_0 weights ≈ 1.9 GB + 60 k-token Q8_0 KV cache ≈ 1.1 GB → ~2.85 GB
- Combined ≈ 4 GB with ~25 MiB headroom

See `ops/llm/lazy-lamacpp/AGENTS.md` for the full accounting and the rationale behind simultaneous GPU residency.

---

## pgadmin

Deployed in both modes. Container listens on 80, published on host `5050`. Servers pre-registered via `ops/infra/pgadmin/servers.json`:

- `substrate_graph` — the main substrate DB
- `keycloak` — Keycloak's DB
- `postgres (superuser)` — full admin

In prod, home-stack's NPM exposes this at `pgadmin.<domain>` (typically behind an IP allowlist at the NPM layer).

---

## Resource requirements

### Development

| Component | CPU | Memory | Storage |
|---|---|---|---|
| PostgreSQL | 2 cores | 2 GB | 20 GB |
| Keycloak | 1 core | 1 GB | 5 GB |
| lazy-lamacpp | 2 cores | 4 GB (VRAM shared 4 GB) | 10 GB |

### Production

| Component | CPU | Memory | Storage |
|---|---|---|---|
| PostgreSQL | 4 cores | 8 GB | 200 GB SSD |
| Keycloak | 2 cores | 2 GB | 20 GB |
| lazy-lamacpp | 4 cores | 8 GB (VRAM 6+ GB) | 20 GB |

---

## Health checks

```bash
# Postgres
pg_isready -U postgres -h localhost

# Keycloak
curl http://localhost:8080/health/ready    # uses port 9000 inside the container;
                                           # compose.yaml's healthcheck uses a
                                           # raw TCP probe to bypass strict hostname

# lazy-lamacpp
curl http://localhost:8101/v1/models
curl http://localhost:8102/v1/models

# Full substrate sweep
make doctor
```

---

## Backup strategy

```bash
# Single-DB substrate backup
pg_dump -h localhost -U substrate_graph substrate_graph > substrate_graph.sql

# Keycloak state
pg_dump -h localhost -U keycloak keycloak > keycloak.sql
```

For prod, prefer WAL archiving + point-in-time recovery at the Postgres layer, managed by whatever runs the home-stack Postgres container.

---

## Security

### Network
- All inter-service traffic rides the `substrate_internal` Docker bridge
- Only the debug ports (3535 / 8080 / 5050 / 8180 / 8181 / 8182 / 5432) are published on the host
- Prod: TLS terminated at home-stack's NPM; substrate sees plain HTTP on internal ports with `X-Forwarded-Proto: https` headers forwarded by NPM

### Data at rest
- PostgreSQL: filesystem-level encryption recommended (LUKS / dm-crypt on the host)
- No sensitive data in lazy-lamacpp model caches (models are public GGUFs)
- `.env.local` and `.env.prod` are gitignored and live on local disk only

### Access control
- Separate DB users per logical database (`substrate_graph`, `keycloak`)
- Minimal privileges (no superuser access from applications)
- Keycloak realm import driven by a gitignored rendered file (template + template variables live in git, secrets do not)
