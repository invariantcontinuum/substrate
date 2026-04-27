# Environment Variables

Substrate does **not** use per-service `.env` files. The committed source of truth is the pair of root templates:

- `.env.local.example`
- `.env.prod.example`

At runtime the stack reads one user-owned env file:

- `.env.local` for `MODE=local`
- `.env.prod` for `MODE=prod`

`compose.yaml`, `scripts/configure.sh`, and the service settings classes all depend on that root env-file model. If a key is tunable in service code, it must exist in both committed templates.

---

## Runtime env files

| File | Committed | Purpose |
|---|---|---|
| `.env.local.example` | Yes | Localhost/dev template |
| `.env.prod.example` | Yes | Production template |
| `.env.local` | No | User-owned local values |
| `.env.prod` | No | User-owned prod values |

The active file is selected by `MODE`:

```bash
make up              # uses .env.local
make up MODE=prod    # uses .env.prod
```

---

## Mode-specific URL block

These are the keys that change between local and prod:

| Key | Local | Prod |
|---|---|---|
| `APP_URL` | `http://localhost:3535` | `https://app.<domain>` |
| `VITE_KEYCLOAK_URL` | `http://localhost:8080` | `https://auth.<domain>` |
| `KEYCLOAK_ISSUER` | `http://localhost:8080/realms/substrate` | `https://auth.<domain>/realms/substrate` |
| `KC_HOSTNAME` | `http://localhost:8080` | `https://auth.<domain>` |
| `KC_HOSTNAME_STRICT` | `false` | `true` |
| `KC_START_COMMAND` | `start-dev` | `start` |
| `CORS_ORIGINS` | localhost origins | app origin only |

Substrate publishes the same host ports in both modes. In prod, the sibling `home-stack` repo terminates TLS and proxies those host ports.

---

## Shared platform settings

These keys apply in both modes:

### Core platform

- `KEYCLOAK_REALM`
- `SERVICE_LOG_PRETTY`
- `AUTH_DISABLED`

### Postgres

- `POSTGRES_VERSION`
- `POSTGRES_SUPERUSER`
- `POSTGRES_SUPERUSER_PASSWORD`
- `GRAPH_DB_USER`
- `GRAPH_DB_PASSWORD`
- `GRAPH_DB_NAME`
- `PG_POOL_MIN_SIZE` (Settings → Postgres surfaces)
- `PG_POOL_MAX_SIZE` (Settings → Postgres surfaces)
- `PG_POOL_RECYCLE_SECONDS` (Settings → Postgres surfaces)
- `PG_STATEMENT_TIMEOUT_MS` (Settings → Postgres surfaces)
- `PG_LOCK_TIMEOUT_MS` (Settings → Postgres surfaces)
- `PG_SSL_VERIFY` (Settings → Postgres surfaces)

### Keycloak

- `KC_DB_USER`
- `KC_DB_PASSWORD`
- `KC_DB_NAME`
- `KC_BOOTSTRAP_ADMIN_USERNAME`
- `KC_BOOTSTRAP_ADMIN_PASSWORD`
- `KEYCLOAK_REGISTRATION_ALLOWED`
- `KC_GATEWAY_CLIENT_SECRET`
- `GITHUB_OAUTH_APP_CLIENT_ID`
- `GITHUB_OAUTH_APP_CLIENT_SECRET`

### pgAdmin

- `PGADMIN_DEFAULT_EMAIL`
- `PGADMIN_DEFAULT_PASSWORD`

---

## LLM and retrieval settings

These settings drive the host-local lazy-lamacpp endpoints and the graph/ask pipelines.

### Embeddings

- `EMBEDDING_URL`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIM`
- `EMBEDDING_DOCUMENT_PREFIX`
- `EMBEDDING_QUERY_PREFIX`
- `EMBEDDING_MAX_INPUT_CHARS`
- `EMBED_BATCH_SIZE`
- `EMBEDDING_HTTP_TIMEOUT_CONNECT_S`
- `EMBEDDING_HTTP_TIMEOUT_READ_S`
- `EMBEDDING_HTTP_TIMEOUT_WRITE_S`
- `EMBEDDING_HTTP_TIMEOUT_POOL_S`

### Dense LLM / summaries / ask

- `DENSE_LLM_URL`
- `DENSE_LLM_MODEL`
- `LLM_API_KEY`
- `SUMMARY_MAX_TOKENS`
- `SUMMARY_TOTAL_BUDGET_CHARS`
- `SUMMARY_EDGE_NEIGHBORS`
- `SUMMARY_NEIGHBOR_CHARS`
- `SUMMARY_FILE_BUDGET_RATIO`
- `SUMMARY_NEIGHBOR_BUDGET_RATIO`
- `SUMMARY_CONTEXT_RETRY_SCALES`
- `SUMMARY_INSTRUCTION`
- `ASK_TOP_K`
- `ASK_HISTORY_TURNS`
- `ASK_TOTAL_BUDGET_CHARS`
- `ASK_MAX_TOKENS`
- `ASK_CONTEXT_RETRY_SCALES`
- `ASK_TEMPERATURE`
- `ASK_LLM_TIMEOUT_S`
- `ASK_SYSTEM_INSTRUCTION`
- `FILE_RECONSTRUCT_MAX_BYTES`

`SUMMARY_*`, `ASK_*`, `EMBEDDING_MAX_INPUT_CHARS`, and `CHUNK_SIZE` should stay aligned with the relevant lazy-lamacpp `CONTEXT_SIZE`.

---

## Ingestion tuning

These settings shape chunking, embedding throughput, sync-runner cadence, GitHub API behaviour, and retention:

- `CHUNK_SIZE`
- `CHUNK_OVERLAP`
- `FILE_SUMMARY_PREVIEW_LINES`
- `AGE_BATCH_SIZE`
- `RUNNER_POLL_INTERVAL_S`
- `RUNNER_CLAIM_BATCH_SIZE`
- `RUNNER_SHUTDOWN_TIMEOUT_S`
- `SYNC_CANCELLATION_POLL_EVERY_N`
- `SCHEDULER_POLL_INTERVAL_S`
- `GITHUB_API_MAX_CONNECTIONS`
- `GITHUB_API_MAX_KEEPALIVE_CONNECTIONS`
- `GITHUB_API_TIMEOUT_CONNECT_S`
- `GITHUB_API_TIMEOUT_READ_S`
- `GITHUB_API_TIMEOUT_WRITE_S`
- `GITHUB_API_TIMEOUT_POOL_S`
- `RETENTION_ENABLED`
- `RETENTION_AGE_DAYS`
- `RETENTION_PER_SOURCE_CAP`
- `RETENTION_TICK_INTERVAL_S`

---

## Graph / SSE settings

These keys shape graph read behaviour and gateway/graph SSE retention:

- `GRAPH_QUERY_TIMEOUT_SECONDS`
- `SSE_POOL_MIN_SIZE`
- `SSE_POOL_MAX_SIZE`
- `SSE_RETENTION_ENABLED`
- `SSE_RETENTION_HOURS`
- `SSE_RETENTION_TICK_S`
- `SSE_RETENTION_BATCH_SIZE`

---

## What does not exist anymore

These older concepts are stale and should not be reintroduced into docs or config:

- No per-service `.env.example` files
- No `REDIS_URL`
- No WebSocket runtime transport
- No separate `substrate_ingestion` database
- No frontend `VITE_WS_URL`

Realtime is SSE only, and the single relational boundary is `substrate_graph`.

---

## GitHub Actions configuration

The repo now includes GitHub Actions for CI, snapshot GHCR publishing, release-branch publishing, and prod deployment.

### Version source

The root `package.json` version is the release source of truth:

- `main` publishes `X.Y.Z-SNAPSHOT` images to GHCR.
- release branches must be named `vX.Y.Z`.
- the release branch version and root `package.json` version must match exactly.

### Required repository secrets

- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_PRIVATE_KEY`

### Required repository variables

- `PROD_SSH_PORT`
- `PROD_DEPLOY_PATH`

`deploy-prod.yml` uses those settings to SSH into the prod host and run `scripts/deploy-prod.sh`. The remote checkout must already exist, and `.env.prod` must already be present on disk there.

### Published GHCR images

- `ghcr.io/invariantcontinuum/substrate-postgres`
- `ghcr.io/invariantcontinuum/substrate-gateway`
- `ghcr.io/invariantcontinuum/substrate-ingestion`
- `ghcr.io/invariantcontinuum/substrate-graph`
- `ghcr.io/invariantcontinuum/substrate-frontend`
- `ghcr.io/invariantcontinuum/substrate-docs`

### Release inputs

`release.yml` creates or updates a GitHub Release for a `vX.Y.Z` branch or manual `vX.Y.Z` ref and attaches:

- a built docs tarball
- `compose.yaml`
- `README.md`
- `.env.local.example`
- `.env.prod.example`
