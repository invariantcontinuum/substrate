# Quickstart

Two commands get the full stack running on localhost. A third swaps it onto a real domain with TLS.

## Local dev

```bash
gh repo clone invariantcontinuum/substrate
cd substrate
make llm-start MODEL=embeddings      # systemd-user; lazy-lamacpp
make llm-start MODEL=dense
make deploy-dev                      # configure (localhost) + build + start
make doctor                          # 13/13 PASS when everything is green
```

`make deploy-dev` performs two steps: `make configure MODE=dev` regenerates `.env`, `env/overlays/dev.env`, and `ops/infra/keycloak/substrate-realm.json` from the committed template; `make up` then runs `docker compose` with the dev overlay (debug ports + pgadmin).

### URLs (dev)

| URL | Purpose |
|---|---|
| http://localhost:3535 | Frontend |
| http://localhost:8080 | Keycloak (admin login + realm) |
| http://localhost:5050 | pgadmin (pre-registers `substrate_graph`) |
| http://localhost:5432 | Postgres (optional; `docker compose exec postgres psql ...` works too) |
| http://localhost:8180 | Gateway (debug; browser reaches it via the frontend's nginx) |
| http://localhost:8181 | Ingestion (debug) |
| http://localhost:8182 | Graph (debug) |
| http://localhost:8101 | Embeddings LLM (lazy-lamacpp) |
| http://localhost:8102 | Dense LLM (lazy-lamacpp) |

## Production deploy

Requires: a domain you control, DNS `A` records for `app.<domain>` and `auth.<domain>` pointing at the host, and ports 80 + 443 reachable (Let's Encrypt HTTP-01).

```bash
make deploy-prod DOMAIN=example.com ACME_EMAIL=ops@example.com
```

The prod override bundles Traefik v3, terminates TLS via Let's Encrypt, and routes:

- `https://app.example.com` → frontend container
- `https://auth.example.com` → keycloak container

No debug ports are published; pgadmin is disabled. `make configure MODE=prod DOMAIN=...` alone regenerates config without bringing the stack up.

### What the switcher rewrites

Running `make configure MODE=<mode>` regenerates:

- `.env` — concatenation of `env/platform.env` + `env/infra.env` + `env/llm.env` + `env/overlays/<mode>.env`
- `env/overlays/<mode>.env` — derived URLs, ports, scheme, Keycloak hostname
- `ops/infra/keycloak/substrate-realm.json` — rendered from `substrate-realm.template.json` with correct `redirectUris`, `webOrigins`, and the `substrate-gateway` client secret pulled from `KC_GATEWAY_CLIENT_SECRET`
- `.deploy-mode` — marker `make up`/`make down`/`make restart` read to pick the right compose overlay

All four are gitignored. Re-running `configure` on a previously-configured repo preserves user-edited secrets in `env/platform.env` and `env/infra.env` (keys kept, unknown keys dropped, new keys added from the `.example`).

### Switching modes

```bash
make down                              # stop the current stack
make deploy-prod DOMAIN=example.com    # or: make deploy-dev
```

## Dev-server (hot reload) vs containerized

**Containerized (default):** `make deploy-dev` builds the frontend and serves it via nginx inside `substrate-frontend`.

**Vite hot reload:** `cd apps/frontend && pnpm dev` runs Vite on `localhost:5173`, proxying `/api` and `/auth` to the host-published gateway at `localhost:8180`. Both modes coexist.

## Make targets

| Target | Effect |
|---|---|
| `make configure MODE=dev` | Regenerate `.env` + realm JSON for localhost. |
| `make configure MODE=prod DOMAIN=foo.com [ACME_EMAIL=you@foo.com]` | Regenerate `.env` + realm JSON for `app.foo.com` / `auth.foo.com`. |
| `make deploy-dev` | `configure MODE=dev` + `up`. |
| `make deploy-prod DOMAIN=...` | `configure MODE=prod ...` + `up`. |
| `make dev` / `make prod` | Aliases for the above. |
| `make up` | Build + start using the last configured mode (reads `.deploy-mode`). |
| `make down` | Stop + remove containers; volumes persist. |
| `make nuke` | Stop + remove volumes (destroys Postgres data — confirms first). |
| `make nuke-keycloak` | Drop keycloak DB + `kc_data` so `--import-realm` re-runs (graph DB untouched). |
| `make restart` | `down` → `up`, same mode. |
| `make ps` / `make logs` | Container status / tail logs. |
| `make llm-start MODEL=<name>` | Start an LLM systemd-user unit (`embeddings`, `dense`, `sparse`, `reranker`, `coding`). |
| `make llm-stop MODEL=<name>` | Stop a matching LLM unit. |
| `make llm-status` | Status across all LLM units. |
| `make doctor` | Probe every component and print PASS/FAIL per probe. |
| `make test` | Unit + integration tests (testcontainers for real PG + AGE). |
| `make test-e2e` | Playwright smoke against the live stack. |
| `make lint` | ruff + mypy + vulture + tsc + eslint + knip + banned-token gate. |
| `make check-contracts` | Diff pydantic JSON Schema vs zod JSON Schema. |

## Dev port map (host-published)

```text
3535 → frontend      (container 3000)
5050 → pgadmin       (container 80, dev only)
5432 → postgres
8080 → keycloak
8101 → embeddings LLM (host systemd)
8102 → dense LLM      (host systemd)
8180 → gateway       (container 8080, debug)
8181 → ingestion     (container 8081, debug)
8182 → graph         (container 8082, debug)
```

In prod only 80 and 443 are published — everything else is reachable only through Traefik.

## Realtime transport

Server → client events flow through `GET /api/events` (SSE), backed by Postgres `LISTEN/NOTIFY` on channel `substrate_sse` + a `sse_events` table for durable replay. Reconnection uses `Last-Event-ID`. WebSockets, polling, and Redis are gone — the `make lint` banned-token gate fails the build if any reappears.

## Data boundary

Single DB: `substrate_graph` (Apache AGE + pgvector). Ingestion writes here; graph reads here. `substrate_ingestion` no longer exists.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `no deployment configured` from `make up` | Run `make configure MODE=dev` first (or use `make deploy-dev`). |
| `port is already allocated` on `make deploy-dev` | Another stack holds a port listed above — `docker ps` to find it, then stop it. |
| Keycloak realm not reachable after first start | `make nuke-keycloak` — realm import only runs on a fresh `kc_data` volume. |
| pgadmin restarts with "permission denied" on pgpass | `docker volume rm substrate_pgadmin_data && make up`. |
| `doctor` fails on LLM probes | `make llm-start MODEL=embeddings && make llm-start MODEL=dense`. |
| SSE connection keeps reopening | Expected on token expiry — server closes with `token_expired`, client refreshes and reconnects. |
| Prod: Let's Encrypt fails to issue | Check ports 80 + 443 are reachable from the public internet and DNS resolves `app.<domain>` / `auth.<domain>` to the host. |
| Want to rotate the gateway client secret | Edit `KC_GATEWAY_CLIENT_SECRET` in `env/infra.env`, then `make configure MODE=<mode>` + `make nuke-keycloak`. |
