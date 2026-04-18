# Quickstart

One clone, one command set, one laptop. No external DNS. No home-stack dependency.

```bash
gh repo clone invariantcontinuum/substrate
cd substrate
make bootstrap                       # copies env/*.env.example → env/*.env, builds .env, runs doctor
make llm-start MODEL=embeddings      # systemd-user; lazy-lamacpp
make llm-start MODEL=dense
make up                              # 7 containers on substrate_internal bridge
make doctor                          # 13/13 PASS when everything is green
```

## URLs

| URL | Purpose |
|---|---|
| http://localhost:3535 | Frontend |
| http://localhost:8080 | Keycloak (admin login + realm) |
| http://localhost:5050 | pgadmin (pre-registers substrate_graph) |
| http://localhost:5432 | Postgres (optional; `docker compose exec postgres psql ...` works too) |
| http://localhost:8180 | Gateway (debug; browser goes via frontend's nginx proxy) |
| http://localhost:8101 | Embeddings LLM (lazy-lamacpp) |
| http://localhost:8102 | Dense LLM (lazy-lamacpp) |

## Dev-server (hot reload) vs containerized

**Containerized (default):** `make up` builds all four app services + frontend. Frontend is served by nginx inside `substrate-frontend`.

**Vite hot reload:** `cd apps/frontend && pnpm dev` runs Vite on `localhost:5173`, proxying `/api` and `/auth` to the host-published gateway at `localhost:8180`. Both modes coexist.

## Make targets

| Target | Effect |
|---|---|
| `make bootstrap` | Idempotent first-run (env files + image pull + doctor). |
| `make up` | Build + start the full stack. |
| `make down` | Stop + remove containers (volumes persist). |
| `make nuke` | Stop + remove volumes (destroys Postgres data — confirms first). |
| `make restart` | down → up. |
| `make ps` | Container status. |
| `make logs` | Tail all container logs. |
| `make llm-start MODEL=<name>` | Start an LLM systemd-user unit (e.g. `embeddings`, `dense`, `sparse`, `reranker`, `coding`). |
| `make llm-stop MODEL=<name>` | Stop the matching LLM unit. |
| `make llm-status` | `systemctl --user status` across all LLM units. |
| `make doctor` | Probe every component and print PASS/FAIL per probe. |
| `make test` | Unit + integration tests (uses testcontainers for real PG+AGE). |
| `make test-e2e` | Playwright smoke against the live stack. |
| `make lint` | ruff + mypy + vulture (Python); tsc + eslint + knip (frontend); banned-token grep gate. |
| `make check-contracts` | Diff pydantic JSON Schema vs zod JSON Schema — fails on divergence. |

## Port map (host-published)

```text
3000 (unused; substrate-homepage in parallel home-stack may bind this)
3535 → frontend  (container 3000)
5050 → pgadmin   (container 80)
5432 → postgres
8080 → keycloak
8101 → embeddings LLM (host systemd)
8102 → dense LLM      (host systemd)
8180 → gateway   (container 8080)  — debug only; browser uses 3535
```

## Realtime transport

Server → client events flow through a single channel: `GET /api/events` (SSE).

Backed by Postgres `LISTEN/NOTIFY` on channel `substrate_sse` + a `sse_events`
table for durable replay. Reconnection uses `Last-Event-ID` (native
`EventSource` behavior). WebSockets and React-Query `refetchInterval` are gone
— the `make lint` banned-token gate fails the build if either reappears.

## Data boundary

Single DB: `substrate_graph` (Apache AGE + pgvector). Ingestion writes here;
graph reads here. `substrate_ingestion` no longer exists. Redis no longer
exists.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `port is already allocated` on `make up` | home-stack / old substrate-platform containers holding :5432/:8080/:5050 — `docker stop` them first. |
| Keycloak realm not reachable | `make down && make nuke && make up` — realm import only runs on a fresh `kc_data` volume. |
| pgadmin restarts with "permission denied" on pgpass | `docker volume rm substrate_pgadmin_data && make up`. |
| `doctor` fails on LLM probes | `make llm-start MODEL=embeddings && make llm-start MODEL=dense`. |
| SSE connection keeps reopening | Expected on token expiry (server closes with `token_expired`; client refreshes and reconnects). |
