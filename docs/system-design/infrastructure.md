# Infrastructure

Substrate's infrastructure layer provides data persistence, identity services, and local AI inference.

---

## Overview

| Component | Technology | Purpose | Port |
|-----------|------------|---------|------|
| Primary Database | PostgreSQL 16 | Relational data, embeddings, graph queries | 5432 |
| Graph Extension | Apache AGE | Cypher graph queries inside PostgreSQL | — |
| Vector Extension | pgvector | 1024-dimensional embeddings | — |
| Identity | Keycloak | OIDC, JWT issuance | 8080 |
| AI Inference | lazy-lamacpp | Local embedding and LLM serving | 8101-8105 |

---

## PostgreSQL

### Role

PostgreSQL is the **single source of truth** for all Substrate data. It stores:
- Relational metadata (sources, syncs, schedules, issues)
- Vector embeddings (`pgvector`)
- Graph topology (`Apache AGE`)

### Databases

| Database | Owner | Purpose |
|----------|-------|---------|
| `substrate_graph` | `substrate_graph` | Graph service data |
| `substrate_ingestion` | `substrate_ingestion` | Ingestion service state |

### Extensions

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS age;
CREATE EXTENSION IF NOT EXISTS vector;
```

### Connection Pooling

Both services use `asyncpg` connection pools:

- **Graph Service**: Default pool sizing
- **Ingestion Service**: Pool sized 4–25 to avoid saturation during heavy background writes

For production, PgBouncer is recommended:

```ini
[databases]
substrate_graph = host=localhost port=5432 dbname=substrate_graph

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
max_client_conn = 1000
default_pool_size = 25
```

---

## Apache AGE

### Role

Apache AGE is a PostgreSQL extension that enables Cypher graph queries natively inside PostgreSQL. Substrate uses it instead of a standalone Neo4j server.

### Graph Name

```sql
-- The graph used by Substrate
SELECT * FROM ag_catalog.create_graph('substrate');
```

### Cypher Execution

Queries are executed via:
```sql
SELECT * FROM cypher('substrate', $$
  MATCH (a:File)-[r]->(b:File)
  WHERE r.sync_id IN ['uuid1', 'uuid2']
  RETURN a.file_id, b.file_id, r.weight
$$) AS (result agtype);
```

### Connection Setup

On every new pool connection, the Graph and Ingestion services run:
```sql
LOAD 'age';
SET search_path = ag_catalog, public;
```

This is done via `asyncpg` `init` callbacks and `server_settings` to survive connection resets.

---

## pgvector

### Role

Stores 1024-dimensional vector embeddings for semantic search.

### Columns

| Table | Column | Type |
|-------|--------|------|
| `file_embeddings` | `embedding` | `vector(1024)` |
| `content_chunks` | `embedding` | `vector(1024)` |

### Search Queries

```sql
-- Cosine similarity search
SELECT id, name, file_path, embedding <=> $1 AS distance
FROM file_embeddings
WHERE type = 'source'
ORDER BY embedding <=> $1
LIMIT 10;
```

The `<=>` operator computes cosine distance (lower is better).

---

## Keycloak

### Role

Identity provider for OIDC authentication and JWT issuance.

### Realm Configuration

- **Realm**: `substrate`
- **Client (frontend)**: `substrate-frontend` (public client, PKCE)
- **Issuer**: `{KEYCLOAK_URL}/realms/substrate`
- **JWKS Endpoint**: `{KEYCLOAK_URL}/realms/substrate/protocol/openid-connect/certs`

### Token Characteristics

- **Algorithm**: RS256
- **Access token lifetime**: 5 minutes
- **Refresh token lifetime**: 30 minutes
- **Audience verification**: Not enforced by Gateway (`verify_aud=False`)

---

## lazy-lamacpp (Local AI Inference)

### Role

On-demand local LLM serving for embeddings and summaries.

### Models and Ports

| Model | Port | Purpose |
|-------|------|---------|
| `embeddings` | 8101 | File and chunk embeddings (1024-dim) |
| `dense` | 8102 | File summaries, dense reasoning |
| `sparse` | 8103 | Sparse retrieval (future) |
| `reranker` | 8104 | Search reranking (future) |
| `coding` | 8105 | Code generation (future) |

### Startup Commands

```bash
cd ~/github/lazy-lamacpp
make start MODEL=embeddings
make start MODEL=dense
make status MODEL=embeddings
```

### API Compatibility

All endpoints expose an OpenAI-compatible API:
- Embeddings: `POST /v1/embeddings`
- Chat completions: `POST /v1/chat/completions`

---

## Resource Requirements

### Development

| Component | CPU | Memory | Storage |
|-----------|-----|--------|---------|
| PostgreSQL | 2 cores | 2 GB | 20 GB |
| Keycloak | 1 core | 1 GB | 5 GB |
| lazy-lamacpp | 2 cores | 4 GB | 10 GB |

### Production

| Component | CPU | Memory | Storage |
|-----------|-----|--------|---------|
| PostgreSQL | 4 cores | 8 GB | 200 GB SSD |
| Keycloak | 2 cores | 2 GB | 20 GB |
| lazy-lamacpp | 4 cores | 8+ GB | 20 GB |

---

## Health Checks

### PostgreSQL

```bash
pg_isready -U postgres -h localhost
```

### Keycloak

```bash
curl http://localhost:8080/health/ready
```

### lazy-lamacpp

```bash
curl http://localhost:8101/health
curl http://localhost:8102/health
```

---

## Backup Strategy

### PostgreSQL

```bash
# Backup graph database
pg_dump -h localhost -U substrate_graph substrate_graph > substrate_graph_backup.sql

# Backup ingestion database
pg_dump -h localhost -U substrate_ingestion substrate_ingestion > substrate_ingestion_backup.sql

# Point-in-time recovery via WAL archiving (recommended for production)
```

---

## Security

### Network
- All inter-service traffic over internal Docker network
- No external exposure except Gateway (8080), Keycloak (8080), and frontend (3000)
- TLS recommended for production

### Data at Rest
- PostgreSQL: Enable transparent data encryption (TDE) or filesystem-level encryption
- No sensitive data in local AI inference caches

### Access Control
- Database users per service (`substrate_graph`, `substrate_ingestion`)
- Minimal privileges (no superuser access from applications)
- Keycloak realm separation for multi-environment deployments
