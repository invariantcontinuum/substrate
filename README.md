# substrate

Substrate governance platform — monorepo.

## Quickstart

```bash
gh repo clone invariantcontinuum/substrate
cd substrate
make llm-start MODEL=embeddings
make llm-start MODEL=dense
make deploy-dev
# open http://localhost:3535
```

`make deploy-dev` regenerates config for localhost, builds the stack, and brings it up. See `docs/developer-guide/quickstart.md` for hot reload, troubleshooting, and the full make target list.

### Dev URLs

| URL | Service |
|---|---|
| http://localhost:3535 | Frontend |
| http://localhost:8080 | Keycloak |
| http://localhost:5050 | pgadmin (dev only) |
| http://localhost:5432 | Postgres (optional) |
| http://localhost:8180 | Gateway (debug) |
| http://localhost:8101 | Embeddings LLM |
| http://localhost:8102 | Dense LLM |

## Production

```bash
make deploy-prod DOMAIN=example.com ACME_EMAIL=ops@example.com
```

Requires DNS `A` records for `app.<domain>` and `auth.<domain>` and ports 80 + 443 open on the host. Prod bundles Traefik v3 with Let's Encrypt; no other ports are published and pgadmin is not deployed.

## How the deploy switcher works

| Generator | Output | Checked in? |
|---|---|---|
| `scripts/set-env.sh <mode>` | `.env`, `env/overlays/<mode>.env`, `.deploy-mode` | Gitignored |
| `scripts/render-realm.py` | `ops/infra/keycloak/substrate-realm.json` | Gitignored |
| — | `ops/infra/keycloak/substrate-realm.template.json` | Yes |
| — | `env/{platform,infra,llm}.env.example`, `env/overlays/*.env.example` | Yes |

`make configure MODE=dev|prod [DOMAIN=...] [ACME_EMAIL=...]` runs both generators. `make up/down/restart` read `.deploy-mode` to pick the right compose overlay automatically.

Secrets in `env/platform.env` / `env/infra.env` / `env/llm.env` survive re-configure — the script key-merges against the `.example` shape.

## Layout

```text
apps/frontend                  # React + Vite + TypeScript
services/
  gateway/                     # FastAPI — auth + SSE fan-out + REST proxy
  ingestion/                   # FastAPI — ingest workers, writes to graph DB
  graph/                       # FastAPI — read API + AGE + pgvector
packages/
  substrate-common/            # Shared Python lib
  substrate-web-common/        # Shared TS lib
  substrate-graph-builder/     # Plugin registry producing graph documents
  graph-ui/                    # Imported from invariantcontinuum/graph
ops/
  compose/                     # docker compose (base + dev override + prod override)
  infra/{postgres,keycloak,pgadmin}/
  llm/lazy-lamacpp/            # systemd-user LLM runtime
env/
  {platform,infra,llm}.env.example
  overlays/{dev,prod}.env.example
scripts/                       # set-env, render-realm, doctor, run-tests, run-lint
docs/                          # developer guide
```

## Architectural constraints

- **Single data boundary:** `substrate_graph` (Apache AGE + pgvector). No `substrate_ingestion` database. No second DSN.
- **Realtime transport:** `GET /api/events` (SSE) only, backed by Postgres `LISTEN/NOTIFY`. No WebSockets, no polling, no Redis — `make lint` fails if those tokens appear in application code.
- **Internal service DNS:** Container-to-container traffic uses the `substrate_internal` bridge. `host.docker.internal` is only legal for reaching the host-local LLM endpoints.
- **Shared code:** `packages/substrate-common` (Python) and `packages/substrate-web-common` (TS) own shared concerns; services don't duplicate them.
- **Testing:** Integration tests use `testcontainers-python` for a real Postgres + AGE + pgvector. No DB mocks.

## Docs

- `docs/developer-guide/quickstart.md` — full setup, make target reference, troubleshooting.
- `docs/developer-guide/adding-a-language-plugin.md` — graph-builder plugin walkthrough.
- `apps/frontend/docs/` — frontend architecture and system design.
