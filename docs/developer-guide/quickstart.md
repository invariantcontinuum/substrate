# Quickstart

One `.env`, one `compose.yaml`, one `make up`.

## Local dev

```bash
gh repo clone invariantcontinuum/substrate
cd substrate

# Start the local LLM stack (systemd-user, out of band)
cd ops/llm/lazy-lamacpp && make start MODEL=embeddings && make start MODEL=dense && cd -

# Bring up substrate
make up         # first run: creates .env from .env.example and exits — edit it, re-run
make doctor     # should be green once containers are healthy
```

### URLs

| URL | Purpose |
|---|---|
| http://localhost:3535 | Frontend |
| http://localhost:8080 | Keycloak (admin + realm) |
| http://localhost:5050 | pgadmin (servers pre-registered) |
| http://localhost:5432 | Postgres |
| http://localhost:8180 | Gateway (debug; browser reaches it via the frontend's nginx) |
| http://localhost:8181 | Ingestion (debug) |
| http://localhost:8182 | Graph (debug) |
| http://localhost:8101 | Embeddings LLM |
| http://localhost:8102 | Dense LLM |

## Prod

Same stack, different URL block in `.env`. TLS and hostname routing come from [home-stack](../../../home-stack)'s nginx-proxy-manager, which auto-provisions:

- `app.<domain>` → `host.docker.internal:3535`
- `auth.<domain>` → `host.docker.internal:8080`
- `pgadmin.<domain>` → `host.docker.internal:5050`

Substrate publishes the same ports in both modes — NPM reaches them across the host bridge.

### Switching `.env` to prod

In `.env`, replace the dev URL block with (substituting your domain):

```bash
APP_URL=https://app.example.com
VITE_KEYCLOAK_URL=https://auth.example.com
KEYCLOAK_ISSUER=https://auth.example.com/realms/substrate
KC_HOSTNAME=https://auth.example.com
KC_HOSTNAME_STRICT=true
KC_START_COMMAND=start
CORS_ORIGINS=["https://app.example.com"]
```

Then `make up`. The rendered `substrate-realm.json` always includes localhost origins alongside the prod origin, so switching back and forth doesn't require re-rendering anything beyond `make up` running `configure.sh` each time.

## What `make up` does

1. Runs `scripts/configure.sh`:
   - If `.env` is missing, copies `.env.example` → `.env` and exits with instructions.
   - Otherwise, sources `.env` and renders `ops/infra/keycloak/substrate-realm.json` from `substrate-realm.template.json` (substituting URLs, realm name, client secret, admin password).
2. Runs `docker compose up -d --build` against the single root `compose.yaml`.

`.env` and the rendered realm are both gitignored. The template is committed.

## Dev-server hot reload

`cd apps/frontend && pnpm dev` runs Vite on `localhost:5173`, proxying `/api` and `/auth` to the host-published gateway at `localhost:8180`. This coexists with `make up`.

## Make targets

| Target | Effect |
|---|---|
| `make up` | Render realm, build + start the stack. |
| `make down` | Stop containers (volumes persist). |
| `make restart` | `down` + `up`. |
| `make nuke` | Destroy all volumes (confirms first). |
| `make nuke-keycloak` | Drop keycloak DB + `kc_data` so realm re-imports. |
| `make ps` / `make logs` | Container status / tail logs. |
| `make doctor` | Probe every component. |
| `make test` | Unit + integration tests (testcontainers). |
| `make test-e2e` | Playwright smoke against the live stack. |
| `make lint` | ruff + mypy + vulture + tsc + eslint + knip + banned-token gate. |
| `make check-contracts` | Diff pydantic JSON schemas vs zod JSON schemas. |

LLM models live in `ops/llm/lazy-lamacpp/` and have their own Makefile — `make start MODEL=<name>`, `make stop MODEL=<name>`, `make status-all`.

## Realtime transport

Server → client events flow through `GET /api/events` (SSE), backed by Postgres `LISTEN/NOTIFY` on channel `substrate_sse` + a `sse_events` table for durable replay. Reconnection uses `Last-Event-ID`. WebSockets, polling, and Redis are banned — `make lint` fails if any reappear.

## Data boundary

Single DB: `substrate_graph` (Apache AGE + pgvector). Ingestion writes; graph reads.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `make up` exits after creating `.env` | Expected on first run — edit `.env`, re-run. |
| `port is already allocated` | Another stack holds `3535`, `8080`, `5050`, etc. `docker ps` to find it, stop it. |
| Keycloak login redirects to wrong URL | `.env` URL block is still dev-valued — swap to prod URLs and re-run `make up`. |
| Realm import didn't re-run after `.env` swap | `make nuke-keycloak` — realm import only runs on a fresh `kc_data` volume. |
| pgadmin restarts with "permission denied" on pgpass | `docker volume rm substrate_pgadmin_data && make up`. |
| `doctor` fails on LLM probes | `cd ops/llm/lazy-lamacpp && make start MODEL=embeddings && make start MODEL=dense`. |
| SSE reopens on token expiry | Expected — server closes with `token_expired`, client refreshes and reconnects. |
| Rotate gateway client secret | Edit `KC_GATEWAY_CLIENT_SECRET` in `.env`, then `make up && make nuke-keycloak`. |
