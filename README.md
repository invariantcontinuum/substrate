# substrate

Substrate governance platform — monorepo.

## Quickstart

```bash
gh repo clone invariantcontinuum/substrate
cd substrate
# Start the host-managed LLM stack (lives outside this repo) — embeddings on :8101, dense on :8102.
make up              # defaults to MODE=local (.env.local)
# open http://localhost:3535
```

First `make up` copies `.env.local.example` → `.env.local` and exits — edit `.env.local`, then re-run.

### URLs

| URL | Service |
|---|---|
| http://localhost:3535 | Frontend |
| http://localhost:8080 | Keycloak |
| http://localhost:5050 | pgadmin |
| http://localhost:5432 | Postgres |
| http://localhost:8180 | Gateway (debug) |
| http://localhost:8181 | Ingestion (debug) |
| http://localhost:8182 | Graph (debug) |
| http://localhost:8101 | Embeddings LLM (host systemd) |
| http://localhost:8102 | Dense LLM (host systemd) |

## Prod

Prod is the same stack with a different env file. First-time setup:

```bash
cp .env.prod.example .env.prod
# edit .env.prod: replace <your-domain> and <set-a-strong-password> placeholders
make up MODE=prod
```

TLS and hostname routing are handled upstream by the sibling `home-stack` repo's nginx-proxy-manager, which auto-provisions:

- `app.<domain>` → `host.docker.internal:3535`
- `auth.<domain>` → `host.docker.internal:8080`
- `pgadmin.<domain>` → `host.docker.internal:5050`

So substrate keeps publishing the same ports in both modes. No reverse proxy is bundled here.

### Recreate The Prod Stack

When you need to delete and recreate every Substrate container against the prod env file, run:

```bash
ENV_FILE=.env.prod docker compose --env-file .env.prod down --remove-orphans
ENV_FILE=.env.prod docker compose --env-file .env.prod up -d --build --force-recreate
make doctor MODE=prod
```

This preserves `.env.prod` and the named volumes, but replaces the running containers completely.

## Make targets

Every target accepts `MODE=local` (default) or `MODE=prod`, which selects `.env.local` or `.env.prod`.

| Target | Effect |
|---|---|
| `make up` | Render realm from the active env file and build + start the stack. |
| `make down` | Stop the stack (volumes persist). |
| `make restart` | `down` + `up`. |
| `make nuke` | Destroy all volumes (confirms first). |
| `make nuke-keycloak` | Drop keycloak DB + `kc_data` so `--import-realm` re-runs. |
| `make ps` / `make logs` | Container status / tail logs. |
| `make doctor` | Probe every component and print PASS/FAIL. |
| `make test` | Unit + integration tests (testcontainers). |
| `make test-e2e` | Playwright smoke against the live stack. |
| `make lint` | ruff + mypy + vulture + tsc + eslint + knip + banned-token gate. |

The LLM stack lives outside this repo. Substrate services connect to it over HTTP — embeddings on `:8101`, dense on `:8102`. Start it via its own systemd units before running `make up`; the substrate doctor probes those endpoints to confirm reachability.

## GitHub Actions

The repo now includes four GitHub Actions workflows under `.github/workflows/`:

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push to `main` and `v*`, manual dispatch | Validates version alignment, compose config, the stable Python test subset, targeted frontend checks, and the docs build. |
| `publish-snapshot.yml` | Push to `main`, manual dispatch | Builds and publishes every repo-owned container image to GHCR with the current `X.Y.Z-SNAPSHOT` version. |
| `release.yml` | Push to `v*`, manual dispatch | Publishes the release-tagged GHCR images and creates or updates a GitHub Release with generated notes and bundled docs/env artifacts. |
| `deploy-prod.yml` | Manual dispatch | SSHes to the prod host and runs `scripts/deploy-prod.sh`, which fetches the requested ref and recreates the stack with `.env.prod`. |

### Release And Deploy Inputs

- `main` publishes snapshot images to GHCR using the root `package.json` version plus a `-SNAPSHOT` suffix, for example `0.1.0-SNAPSHOT`.
- A release branch named `vX.Y.Z` must match the root `package.json` version exactly. Pushing that branch triggers `release.yml`, which publishes `X.Y.Z` images and creates or updates the matching GitHub Release tag.
- Run `deploy-prod.yml` with a `ref` input when you want to deploy `main`, a release branch, a tag, or a specific commit to the prod host.

### Published GHCR Images

`publish-snapshot.yml` and `release.yml` publish these images:

- `ghcr.io/invariantcontinuum/substrate-postgres`
- `ghcr.io/invariantcontinuum/substrate-gateway`
- `ghcr.io/invariantcontinuum/substrate-ingestion`
- `ghcr.io/invariantcontinuum/substrate-graph`
- `ghcr.io/invariantcontinuum/substrate-frontend`
- `ghcr.io/invariantcontinuum/substrate-docs`

### Required GitHub Secrets / Variables

`deploy-prod.yml` expects these repository settings:

- Secret: `PROD_SSH_HOST`
- Secret: `PROD_SSH_USER`
- Secret: `PROD_SSH_PRIVATE_KEY`
- Variable: `PROD_SSH_PORT`
- Variable: `PROD_DEPLOY_PATH`

The remote host checkout must already exist, and its `.env.prod` must stay on disk. The workflow recreates containers; it does not generate or commit prod secrets.

## Layout

```text
substrate/
├── compose.yaml            # single compose for dev + prod
├── .env.local.example      # dev template
├── .env.prod.example       # prod template
├── Makefile
├── apps/frontend/          # React + Vite + TypeScript
├── services/
│   ├── gateway/            # FastAPI — auth + SSE fan-out + REST proxy
│   ├── ingestion/          # FastAPI — ingest workers
│   └── graph/              # FastAPI — read API + AGE + pgvector
├── packages/
│   ├── substrate-common/
│   ├── substrate-graph-builder/
│   └── graph-ui/
├── ops/
│   └── infra/{postgres,keycloak,pgadmin}/
├── scripts/                # configure, render-realm, doctor, tests, lint
└── docs/                   # developer guide, architecture, system design
```

`.env.local`, `.env.prod`, and `ops/infra/keycloak/substrate-realm.json` are gitignored. The `.example` templates and `substrate-realm.template.json` are committed.

## Architectural constraints

- **Single data boundary:** `substrate_graph` (Apache AGE + pgvector).
- **Realtime transport:** `GET /api/events` (SSE) only. No WebSockets, no polling, no Redis — `make lint` fails if those tokens appear in application code.
- **Internal service DNS:** Container-to-container traffic uses `substrate_internal`. `host.docker.internal` is only legal for reaching the host-local LLM endpoints.
- **Shared code:** `packages/substrate-common` (Python) owns shared backend concerns; the frontend keeps its TS helpers in `apps/frontend/src/lib/` (no separate package).
- **Testing:** Integration tests use `testcontainers-python` for real Postgres + AGE + pgvector. No DB mocks.

## Docs

- `docs/developer-guide/quickstart.md` — setup, troubleshooting, make target reference.
- `docs/developer-guide/environment-variables.md` — root env-file model plus GitHub workflow config.
- `docs/developer-guide/adding-a-language-plugin.md` — graph-builder plugin walkthrough.
- `docs/architecture/`, `docs/system-design/` — architecture and design docs.
