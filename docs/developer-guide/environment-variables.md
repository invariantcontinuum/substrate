# Environment Variables

Complete reference of all environment variables used across Substrate services.

---

## Gateway Service

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `KEYCLOAK_URL` | `http://local-keycloak:8080` | Yes | Base URL of the Keycloak server |
| `KEYCLOAK_REALM` | `substrate` | Yes | Keycloak realm name |
| `KEYCLOAK_ISSUER` | `""` | No | Override the expected JWT issuer |
| `GRAPH_SERVICE_URL` | `http://substrate-graph:8082` | Yes | Upstream graph service URL |
| `INGESTION_SERVICE_URL` | `http://substrate-ingestion:8081` | Yes | Upstream ingestion service URL |
| `REDIS_URL` | `redis://local-redis:6379` | No | **Currently unused** in source code |

---

## Graph Service

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `FLYWAY_URL` | — | Yes* | JDBC URL for Flyway migrations |
| `FLYWAY_USER` | — | Yes* | Flyway migration user |
| `FLYWAY_PASSWORD` | — | Yes* | Flyway migration password |
| `DATABASE_URL` | `postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph` | Yes | PostgreSQL connection string |
| `EMBEDDING_URL` | `http://localhost:8101/v1/embeddings` | Yes | Local embedding model endpoint |
| `EMBEDDING_MODEL` | `embeddinggemma-300M-Q8_0.gguf` | No | Model name passed to embedding service |
| `DENSE_LLM_URL` | `http://localhost:8102/v1/chat/completions` | Yes | Local chat/completion endpoint |
| `DENSE_LLM_MODEL` | `qwen2.5-7b-instruct` | No | Model name for summaries |
| `SUMMARY_MAX_TOKENS` | `160` | No | Max tokens for LLM summary output |
| `SUMMARY_CHUNK_SAMPLE_CHARS` | `4000` | No | Characters of chunk content to feed LLM |
| `APP_PORT` | `8082` | No | FastAPI listen port |
| `LOG_LEVEL` | `INFO` | No | Logging level |

---

## Ingestion Service

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `FLYWAY_URL` | — | Yes* | JDBC URL for Flyway migrations |
| `FLYWAY_USER` | — | Yes* | Flyway migration user |
| `FLYWAY_PASSWORD` | — | Yes* | Flyway migration password |
| `DATABASE_URL` | `postgresql+asyncpg://substrate_ingestion:changeme@local-postgres:5432/substrate_ingestion` | Yes | Internal ingestion database |
| `GRAPH_DATABASE_URL` | `postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph` | Yes | Shared graph database (AGE + relational) |
| `GITHUB_TOKEN` | `""` | Yes* | PAT for GitHub API and clone authentication |
| `APP_PORT` | `8081` | No | FastAPI listen port |
| `EMBEDDING_URL` | `http://localhost:8101/v1/embeddings` | Yes | Local llama-cpp embeddings endpoint |
| `EMBEDDING_MODEL` | `Qwen3-Embedding-0.6B-Q8_0.gguf` | No | Documentation/logging name only |
| `EMBEDDING_DIM` | `1024` | Yes | Must match the served model dimensions |
| `CHUNK_SIZE` | `512` | No | Target tokens per chunk |
| `CHUNK_OVERLAP` | `64` | No | Tokens to overlap between chunks |
| `LOG_LEVEL` | `INFO` | No | Logging level |

*Required if using the GitHub connector.

---

## Frontend

All frontend env vars are prefixed with `VITE_` and must be set at build time.

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `VITE_KEYCLOAK_URL` | `https://auth.invariantcontinuum.io` | Yes | Keycloak base URL |
| `VITE_KEYCLOAK_REALM` | `substrate` | Yes | Keycloak realm |
| `VITE_KEYCLOAK_CLIENT_ID` | `substrate-frontend` | Yes | OIDC client ID |
| `VITE_API_URL` | — | No | API base URL override (rarely needed) |
| `VITE_WS_URL` | Derived from window location | No | WebSocket URL override |

### Vite Dev Server Proxy

During development, Vite proxies these paths to the Gateway:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:8080',
    '/ingest': 'http://localhost:8080',
    '/auth': 'http://localhost:8080',
    '/ws': {
      target: 'ws://localhost:8080',
      ws: true
    }
  }
}
```

---

## Infrastructure (home-stack)

These are typically managed in `~/github/danycrafts/home-stack/.env`:

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL superuser password |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin password |
| `KEYCLOAK_CLIENT_SECRET` | Gateway client secret (if configured) |

---

## lazy-lamacpp (LLM Stack)

These are typically managed in `~/github/lazy-lamacpp/.env`:

| Variable | Purpose |
|----------|---------|
| `MODEL_PATH` | Base directory for GGUF models |
| `EMBEDDING_MODEL` | Model file for port 8101 |
| `DENSE_MODEL` | Model file for port 8102 |

---

## Example .env Files

### Gateway `.env`

```bash
KEYCLOAK_URL=http://local-keycloak:8080
KEYCLOAK_REALM=substrate
GRAPH_SERVICE_URL=http://substrate-graph:8082
INGESTION_SERVICE_URL=http://substrate-ingestion:8081
```

### Graph Service `.env`

```bash
DATABASE_URL=postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph
EMBEDDING_URL=http://localhost:8101/v1/embeddings
DENSE_LLM_URL=http://localhost:8102/v1/chat/completions
```

### Ingestion Service `.env`

```bash
DATABASE_URL=postgresql+asyncpg://substrate_ingestion:changeme@local-postgres:5432/substrate_ingestion
GRAPH_DATABASE_URL=postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
EMBEDDING_URL=http://localhost:8101/v1/embeddings
```

### Frontend `.env`

```bash
VITE_KEYCLOAK_URL=https://auth.invariantcontinuum.io
VITE_KEYCLOAK_REALM=substrate
VITE_KEYCLOAK_CLIENT_ID=substrate-frontend
```
