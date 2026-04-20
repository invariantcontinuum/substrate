# substrate

Substrate governance platform — monorepo.

## Quickstart

```bash
gh repo clone invariantcontinuum/substrate
cd substrate
cd ops/llm/lazy-lamacpp && make start MODEL=embeddings && make start MODEL=dense && cd -
make up
# open http://localhost:3535
```

First `make up` copies `.env.example` → `.env` and exits — edit `.env`, then re-run.

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

Prod is the same stack with different `.env` URLs. Swap the marked block in `.env` to your domain values, then `make up`. TLS and hostname routing are handled upstream by [home-stack](../home-stack)'s nginx-proxy-manager, which auto-provisions:

- `app.<domain>` → `host.docker.internal:3535`
- `auth.<domain>` → `host.docker.internal:8080`
- `pgadmin.<domain>` → `host.docker.internal:5050`

So substrate keeps publishing the same ports in both modes. No reverse proxy is bundled here.

## Make targets

| Target | Effect |
|---|---|
| `make up` | Render realm from `.env` and build + start the stack. |
| `make down` | Stop the stack (volumes persist). |
| `make restart` | `down` + `up`. |
| `make nuke` | Destroy all volumes (confirms first). |
| `make nuke-keycloak` | Drop keycloak DB + `kc_data` so `--import-realm` re-runs. |
| `make ps` / `make logs` | Container status / tail logs. |
| `make doctor` | Probe every component and print PASS/FAIL. |
| `make test` | Unit + integration tests (testcontainers). |
| `make test-e2e` | Playwright smoke against the live stack. |
| `make lint` | ruff + mypy + vulture + tsc + eslint + knip + banned-token gate. |
| `make check-contracts` | Diff pydantic JSON schemas vs zod JSON schemas. |

LLM models live in `ops/llm/lazy-lamacpp/` and are managed by their own Makefile (`make start MODEL=<name>`, `make stop MODEL=<name>`, `make status-all`). They're intentionally not re-exposed here.

## Layout

```text
substrate/
├── compose.yaml            # single compose for dev + prod
├── .env.example            # single env file — all vars
├── Makefile
├── apps/frontend/          # React + Vite + TypeScript
├── services/
│   ├── gateway/            # FastAPI — auth + SSE fan-out + REST proxy
│   ├── ingestion/          # FastAPI — ingest workers
│   └── graph/              # FastAPI — read API + AGE + pgvector
├── packages/
│   ├── substrate-common/
│   ├── substrate-web-common/
│   ├── substrate-graph-builder/
│   └── graph-ui/
├── ops/
│   ├── infra/{postgres,keycloak,pgadmin}/
│   └── llm/lazy-lamacpp/
├── scripts/                # configure, render-realm, doctor, tests, lint
└── docs/                   # developer guide, architecture, system design
```

`.env` and `ops/infra/keycloak/substrate-realm.json` are generated and gitignored. `substrate-realm.template.json` is committed.

## Architectural constraints

- **Single data boundary:** `substrate_graph` (Apache AGE + pgvector).
- **Realtime transport:** `GET /api/events` (SSE) only. No WebSockets, no polling, no Redis — `make lint` fails if those tokens appear in application code.
- **Internal service DNS:** Container-to-container traffic uses `substrate_internal`. `host.docker.internal` is only legal for reaching the host-local LLM endpoints.
- **Shared code:** `packages/substrate-common` (Python) and `packages/substrate-web-common` (TS) own shared concerns.
- **Testing:** Integration tests use `testcontainers-python` for real Postgres + AGE + pgvector. No DB mocks.

## Docs

- `docs/developer-guide/quickstart.md` — setup, troubleshooting, make target reference.
- `docs/developer-guide/adding-a-language-plugin.md` — graph-builder plugin walkthrough.
- `docs/architecture/`, `docs/system-design/` — architecture and design docs.
