# Deployment

Substrate is self-hosted. One repo, one `compose.yaml`, two env templates. Dev runs on localhost; prod rides behind the home-stack nginx-proxy-manager (NPM) for TLS and hostname routing.

---

## Deployment modes

### Local dev (`MODE=local`, default)
- Single machine.
- `make up` reads `.env.local` and brings up the full stack on localhost.
- Browser-facing URLs: `http://localhost:3535` (frontend), `http://localhost:8080` (Keycloak).

### Prod (`MODE=prod`)
- Same compose file. `make up MODE=prod` reads `.env.prod`.
- Ports are still published on the host (3535, 8080, 5050). [home-stack](../../../home-stack)'s NPM proxies `app.<domain>`, `auth.<domain>`, and `pgadmin.<domain>` to those ports via `host.docker.internal` and terminates TLS with Let's Encrypt.
- Substrate itself does not bundle any reverse proxy or TLS terminator.

---

## Startup sequence

```bash
# 1. Start the local LLM stack (systemd-user; out of band)
cd ops/llm/lazy-lamacpp
make start MODEL=embeddings
make start MODEL=dense
cd -

# 2. Bring up substrate
make up                 # MODE=local is the default
# First run copies .env.local.example → .env.local and exits. Edit,
# then re-run `make up`.

# 3. Verify
make doctor             # 15/15 PASS when green
```

Prod uses the same sequence with `make up MODE=prod` after populating `.env.prod` from `.env.prod.example`.

---

## Env file layout

| File | Committed? | Purpose |
|---|---|---|
| `.env.local.example` | Yes | Dev template — localhost URLs, `change-me` placeholders. |
| `.env.prod.example` | Yes | Prod template — `<your-domain>` / `<set-a-strong-password>` placeholders. |
| `.env.local` | No (gitignored) | User-owned dev values. Must persist across sessions. |
| `.env.prod` | No (gitignored) | User-owned prod values. Must persist across sessions. |

Per-service `.env.example` files do **not** exist. The two root-level templates are the single source of truth.

The Makefile passes the active file via `--env-file` and exports `ENV_FILE` so `compose.yaml` can resolve `env_file: ["${ENV_FILE:-.env.local}"]` for each service. Every target accepts `MODE=local|prod`.

---

## compose.yaml (abridged)

Single compose file at repo root. Ports are published identically in both modes so NPM can reach them in prod:

```yaml
name: substrate

networks:
  substrate_internal: { driver: bridge }

volumes:
  pg_data: {}
  kc_data: {}
  pgadmin_data: {}

services:
  postgres:
    env_file: ["${ENV_FILE:-.env.local}"]
    ports: ["5432:5432"]
    networks: [substrate_internal]
    # healthcheck uses pg_isready

  keycloak:
    image: quay.io/keycloak/keycloak:26.0
    command: ["${KC_START_COMMAND}", "--import-realm"]
    env_file: ["${ENV_FILE:-.env.local}"]
    ports: ["8080:8080"]
    networks: [substrate_internal]
    volumes:
      - ./ops/infra/keycloak/substrate-realm.json:/opt/keycloak/data/import/substrate-realm.json:ro

  pgadmin:
    env_file: ["${ENV_FILE:-.env.local}"]
    ports: ["5050:80"]

  gateway:   { ports: ["8180:8080"], networks: [substrate_internal] }
  ingestion: { ports: ["8181:8081"], networks: [substrate_internal] }
  graph:     { ports: ["8182:8082"], networks: [substrate_internal] }

  frontend:
    build:
      args:
        VITE_KEYCLOAK_URL: ${VITE_KEYCLOAK_URL}
        VITE_KEYCLOAK_REALM: ${KEYCLOAK_REALM}
        VITE_KEYCLOAK_CLIENT_ID: "substrate-frontend"
    ports: ["3535:3000"]
```

Service-to-service traffic uses the `substrate_internal` bridge and container DNS (`gateway`, `postgres`, `keycloak`, …). The sole justified `host.docker.internal` usage is outbound to the local LLM endpoints on the host (lazy-lamacpp).

---

## Keycloak realm rendering

`ops/infra/keycloak/substrate-realm.template.json` is committed. `scripts/render-realm.py` (called by `scripts/configure.sh`, which `make up` runs first) renders `substrate-realm.json` — substituting:

- `APP_URL` → `rootUrl` / `baseUrl` and `redirectUris` / `webOrigins`
- `KC_GATEWAY_CLIENT_SECRET` → `substrate-gateway` client secret
- `KC_BOOTSTRAP_ADMIN_PASSWORD` → initial admin credential
- `KEYCLOAK_REALM` → realm name
- `sslRequired` → `external` when `APP_URL` is `https://`, else `none`

The rendered realm always includes both the canonical `APP_URL` origin and `http://localhost:3535` / `http://localhost:3000` origins, so switching modes doesn't require re-rendering logic — same realm works in both. The generated file is gitignored.

---

## Infrastructure requirements

### Minimum (dev)

| Resource | Spec |
|---|---|
| CPU | 6+ cores |
| RAM | 16 GB |
| Storage | 50 GB SSD |
| GPU | 4 GB VRAM (serves embeddings + dense concurrently) |

### Recommended (prod)

| Resource | Spec |
|---|---|
| CPU | 16+ cores |
| RAM | 32+ GB |
| Storage | 200 GB NVMe SSD |
| GPU | 6+ GB VRAM |

---

## Environment variables

All variables live in the active `.env.<mode>` file. The URL block is the only thing that changes between dev and prod; everything else (DB credentials, LLM endpoints, Keycloak bootstrap, pgadmin) is mode-agnostic.

### URL block (mode-specific)

```bash
# Dev (.env.local)
APP_URL=http://localhost:3535
VITE_KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_ISSUER=http://localhost:8080/realms/substrate
KC_HOSTNAME=http://localhost:8080
KC_HOSTNAME_STRICT=false
KC_START_COMMAND=start-dev
CORS_ORIGINS=["http://localhost:3535","http://localhost:3000"]

# Prod (.env.prod) — NPM terminates TLS upstream
APP_URL=https://app.<domain>
VITE_KEYCLOAK_URL=https://auth.<domain>
KEYCLOAK_ISSUER=https://auth.<domain>/realms/substrate
KC_HOSTNAME=https://auth.<domain>
KC_HOSTNAME_STRICT=true
KC_START_COMMAND=start
CORS_ORIGINS=["https://app.<domain>"]
```

### Shared (both modes)

```bash
KEYCLOAK_REALM=substrate

# Single Postgres DB — substrate_graph (AGE + pgvector)
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=...
GRAPH_DB_USER=substrate_graph
GRAPH_DB_PASSWORD=...
GRAPH_DB_NAME=substrate_graph

# Keycloak (dedicated role; separate DB inside the same Postgres)
KC_DB_USER=keycloak
KC_DB_PASSWORD=...
KC_DB_NAME=keycloak
KC_BOOTSTRAP_ADMIN_USERNAME=admin
KC_BOOTSTRAP_ADMIN_PASSWORD=...
KC_GATEWAY_CLIENT_SECRET=...   # rendered into the realm JSON

# pgadmin (always deployed; scoped to localhost in prod via NPM ACL)
PGADMIN_DEFAULT_EMAIL=admin@substrate.dev
PGADMIN_DEFAULT_PASSWORD=...

# Local LLM endpoints (lazy-lamacpp on the host)
EMBEDDING_URL=http://host.docker.internal:8101/v1/embeddings
EMBEDDING_MODEL=embeddings
EMBEDDING_DIM=896
DENSE_LLM_URL=http://host.docker.internal:8102/v1/chat/completions
DENSE_LLM_MODEL=dense
LLM_API_KEY=test
```

Note: there is no `REDIS_URL`, no `substrate_ingestion` database, no `GITHUB_TOKEN` global (GitHub PATs travel per-source via the sources API). The schema enforces a single graph database and SSE-only realtime transport.

---

## Migration management

All SQL migrations live in a single tree: `services/graph/migrations/postgres/`. They run on graph service startup via Flyway (Dockerfile entrypoint). Every migration applies against the single `substrate_graph` database; there is no `substrate_ingestion` migration tree.

Current migration set includes:

- `V1__initial_schema.sql` — base tables (`sources`, `sync_runs`, `sync_issues`, `sync_schedules`, `file_embeddings`, `content_chunks`)
- `V2__add_enabled_to_sources.sql`, `V3__description_generated_at.sql` — incremental columns
- `V5__age_file_id_indexes.sql` — AGE lookup indexes
- `V6__sse_events.sql` — SSE replay table backing `GET /api/events`
- `V4/V7/V8/V9/V10__embedding_dim_*.sql` — embedding column migrations across model swaps (currently `vector(896)` after V10)
- `V11__drop_content_chunks.sql` — drops all chunks so the new AST/semantic chunker repopulates

---

## Backup and recovery

```bash
# Single DB backup
pg_dump -h localhost -U $GRAPH_DB_USER $GRAPH_DB_NAME > substrate_graph.sql

# Keycloak state (separate DB in the same Postgres instance)
pg_dump -h localhost -U $KC_DB_USER $KC_DB_NAME > keycloak.sql

# Restore
psql -h localhost -U $GRAPH_DB_USER $GRAPH_DB_NAME < substrate_graph.sql
```

For prod, prefer WAL archiving + point-in-time recovery managed by whatever runs `home-stack/services/postgres`.

---

## Monitoring

### Health endpoints

```bash
curl http://localhost:8180/health         # gateway (debug port; browser uses the nginx proxy)
curl http://localhost:8181/health         # ingestion
curl http://localhost:8182/health         # graph
curl http://localhost:3535/health         # frontend nginx
curl http://localhost:8080/health/ready   # keycloak
```

### Logs

```bash
docker compose logs -f gateway ingestion graph
# or via Makefile
make logs
```

### Full probe

```bash
make doctor              # prints PASS/FAIL per component (15 checks)
make doctor MODE=prod    # same, against .env.prod values
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `make up` exits creating `.env.local` / `.env.prod` | Expected on first run — edit it, re-run. |
| Keycloak login redirects to the wrong URL | Active env file still has the other mode's URL block — swap and re-run `make up`. |
| Realm doesn't pick up an env edit | `make nuke-keycloak` — `--import-realm` only runs on a fresh `kc_data` volume. |
| pgadmin restarts with "permission denied" on pgpass | `docker volume rm substrate_pgadmin_data && make up`. |
| `doctor` fails on LLM probes | `cd ops/llm/lazy-lamacpp && make start MODEL=embeddings && make start MODEL=dense`. |
| Embedding dim guard fires on graph startup | `pgvector` column dimension in `content_chunks.embedding` / `file_embeddings.embedding` doesn't match `EMBEDDING_DIM`. Run the relevant `V*__embedding_dim_*.sql` migration (auto-applied by Flyway). |
| Prod: `app.<domain>` returns 502 | home-stack NPM isn't reaching `host.docker.internal:3535`. Check NPM's proxy host provisioning (`home-stack/services/nginx-proxy-manager/init-proxy-hosts.sh`). |
