# Quickstart

One compose file. Two env templates (`.env.local.example`, `.env.prod.example`). One `make up`.

## Local dev

```bash
gh repo clone invariantcontinuum/substrate
cd substrate

# Start the local LLM stack (systemd-user, out of band)
cd ops/llm/lazy-lamacpp && make start MODEL=embeddings && make start MODEL=dense && cd -

make up          # MODE=local is the default — uses .env.local
make doctor      # should be green once containers are healthy
```

First `make up` copies `.env.local.example` → `.env.local` and exits. Edit `.env.local` (passwords, anything else), then re-run.

### URLs

| URL | Purpose |
|---|---|
| http://localhost:3535 | Frontend |
| http://localhost:8080 | Keycloak (admin + realm) |
| http://localhost:5050 | pgadmin |
| http://localhost:5432 | Postgres |
| http://localhost:8180 | Gateway (debug; browser reaches it via the frontend's nginx) |
| http://localhost:8181 | Ingestion (debug) |
| http://localhost:8182 | Graph (debug) |
| http://localhost:8101 | Embeddings LLM |
| http://localhost:8102 | Dense LLM |

## Prod

Same stack, `.env.prod` instead of `.env.local`:

```bash
cp .env.prod.example .env.prod
# edit: replace <your-domain>, <set-a-strong-password>, <generate-random-secret>
make up MODE=prod
```

TLS and hostname routing come from the sibling `home-stack` repo's nginx-proxy-manager, which auto-provisions:

- `app.<domain>` → `host.docker.internal:3535`
- `auth.<domain>` → `host.docker.internal:8080`
- `pgadmin.<domain>` → `host.docker.internal:5050`

Substrate publishes the same ports in both modes — NPM reaches them across the host bridge.

### Recreate all prod containers

If you need to delete and recreate the full Substrate runtime in prod without touching `.env.prod`, run:

```bash
ENV_FILE=.env.prod docker compose --env-file .env.prod down --remove-orphans
ENV_FILE=.env.prod docker compose --env-file .env.prod up -d --build --force-recreate
make doctor MODE=prod
```

## What `make up` does

1. Runs `scripts/configure.sh` with `ENV_FILE=.env.$(MODE)`:
   - If the env file is missing, copies its `.example` counterpart and exits with instructions.
   - Otherwise sources it and renders `ops/infra/keycloak/substrate-realm.json` from the committed template.
2. Runs `docker compose --env-file .env.$(MODE) up -d --build`.

The rendered realm always contains both `APP_URL` and localhost origins, so switching modes doesn't require any realm-side rework beyond re-running `make up`.

## Dev-server hot reload

`cd apps/frontend && pnpm dev` runs Vite on `localhost:5173`, proxying `/api` and `/auth` to the host-published gateway at `localhost:8180`. Coexists with `make up`.

## Make targets

Every target accepts `MODE=local` (default) or `MODE=prod`.

| Target | Effect |
|---|---|
| `make up` | Render realm, build + start the stack. |
| `make down` | Stop containers (volumes persist). |
| `make restart` | `down` + `up`. |
| `make nuke` | Destroy all volumes (confirms first). |
| `make nuke-keycloak` | Drop keycloak DB + `kc_data` so realm re-imports. |
| `make ps` / `make logs` | Container status / tail logs. |
| `make doctor` | Probe every component. |
| `make test` | Unit + integration tests. |
| `make test-e2e` | Playwright smoke. |
| `make lint` | ruff + mypy + vulture + tsc + eslint + knip + banned-token gate. |
| `make check-contracts` | Diff pydantic vs zod JSON schemas. |

LLM models have their own Makefile under `ops/llm/lazy-lamacpp/` — `make start MODEL=<name>`, `make stop MODEL=<name>`, `make status-all`.

## GitHub Actions

Substrate now ships with repo-native GitHub Actions under `.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push to `main` and `v*`, manual dispatch | Runs version alignment checks, compose-config validation, the stable Python test subset, targeted frontend checks, and a docs build. |
| `publish-snapshot.yml` | Push to `main`, manual dispatch | Publishes all repo-built container images to GHCR with the current `X.Y.Z-SNAPSHOT` tag. |
| `release.yml` | Push to `v*`, manual dispatch | Publishes `X.Y.Z` GHCR images and creates or updates the matching GitHub Release with generated release notes. |
| `deploy-prod.yml` | Manual dispatch | SSHes to the prod host and executes `scripts/deploy-prod.sh` against `.env.prod`. |

### Release flow

`main` publishes snapshot images using the root `package.json` version plus `-SNAPSHOT`, for example `0.1.0-SNAPSHOT`.

For a release, cut a branch named `vX.Y.Z` from a commit whose root `package.json` version is already `X.Y.Z`, then push that branch:

```bash
git checkout -b v0.1.0
git push origin v0.1.0
```

That branch push triggers `release.yml`.

### Deploy flow

Run `deploy-prod.yml` from GitHub Actions and supply the `ref` you want on the prod host. The workflow expects these repo settings:

- Secret: `PROD_SSH_HOST`
- Secret: `PROD_SSH_USER`
- Secret: `PROD_SSH_PRIVATE_KEY`
- Variable: `PROD_SSH_PORT`
- Variable: `PROD_DEPLOY_PATH`

The remote checkout must already have `.env.prod` present on disk.

## Realtime transport

Server → client events flow through `GET /api/events` (SSE), backed by Postgres `LISTEN/NOTIFY` on channel `substrate_sse` + an `sse_events` table for durable replay. Reconnection uses `Last-Event-ID`. WebSockets, polling, and Redis are banned — `make lint` fails if any reappear.

## Data boundary

Single DB: `substrate_graph` (Apache AGE + pgvector). Ingestion writes; graph reads.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `make up` exits after creating `.env.local` / `.env.prod` | Expected on first run — edit it, re-run. |
| `port is already allocated` | Another stack holds `3535`, `8080`, `5050`, etc. `docker ps` to find it, stop it. |
| Keycloak login redirects to wrong URL | The active env file still has dev URLs (or vice versa) — check `.env.$(MODE)` and rerun `make up MODE=...`. |
| Realm import didn't re-run after env swap | `make nuke-keycloak MODE=...` — realm import only runs on a fresh `kc_data` volume. |
| pgadmin restarts with "permission denied" on pgpass | `docker volume rm substrate_pgadmin_data && make up`. |
| `doctor` fails on LLM probes | `cd ops/llm/lazy-lamacpp && make start MODEL=embeddings && make start MODEL=dense`. |
| SSE reopens on token expiry | Expected — server closes with `token_expired`, client refreshes and reconnects. |
| Rotate gateway client secret | Edit `KC_GATEWAY_CLIENT_SECRET` in the active env file, then `make up && make nuke-keycloak`. |
