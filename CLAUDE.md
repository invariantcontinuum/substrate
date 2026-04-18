# Claude Environment Guide — substrate monorepo

This file outlines the mandates for AI agents working in the `invariantcontinuum/substrate` monorepo. It complements the workspace-wide `/home/dany/github/CLAUDE.md`; where the two disagree about a monorepo-specific rule, this file wins.

## Subagent Hard Rule — Read First

Any subagent dispatched into this repo MUST read this file in full AND the workspace-wide `/home/dany/github/CLAUDE.md` before proceeding with any task. Subagents inherit no parent context and must discover the trunk-based workflow (no feature branches, no PRs), Conventional Commits (single line, no body, no `Co-authored-by`), local-only `/home/dany/github/docs/` tree, and documentation mandates from these files directly.

## Repository Layout

```text
substrate/
├── apps/frontend                 # React + Vite + TypeScript
├── services/
│   ├── gateway/                  # FastAPI — auth + SSE fan-out + REST proxy
│   ├── ingestion/                # FastAPI — ingest workers, writes to graph DB
│   └── graph/                    # FastAPI — read API + AGE + pgvector
├── packages/
│   ├── substrate-common/         # Shared Python lib
│   ├── substrate-web-common/     # Shared TS lib
│   └── graph-ui/                 # Imported from invariantcontinuum/graph (not adopted yet)
├── ops/
│   ├── compose/                  # docker compose
│   ├── infra/{postgres,keycloak,pgadmin}/
│   └── llm/lazy-lamacpp/         # Imported; systemd-managed on host
├── scripts/                      # bootstrap, doctor, import-history
├── env/                          # env templates (one per profile)
└── docs/                         # developer-guide, architecture, target-audience
```

## Local LLM Stack (`ops/llm/lazy-lamacpp`)

systemd-user-managed LLM runtime. Start models on demand — memory is constrained (15.6 GiB RAM, 6 GiB VRAM):

- `make llm-start MODEL=embeddings`
- `make llm-start MODEL=dense`
- `make llm-status`

Endpoints:
- Embeddings: `http://localhost:8101/v1/embeddings` (model name: `embeddings`, dim 1024)
- Dense: `http://localhost:8102/v1/chat/completions` (model name: `dense`)

LLMs stay on the host (not in compose). This is the single justified use of `host.docker.internal` from app services.

## Mandatory Workflows

### 1. Source Control (Git)
- **Trunk-Based:** Commit directly to `main` and push. **No feature branches. No pull requests.**
- **Git Identity:** Read `GIT_USERNAME` and `GIT_EMAIL` from `/home/dany/github/.env` and apply via `git config --global`.
- **Conventional Commits:** Single-line messages. No body. No footer. No `Co-authored-by:` trailer. Prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`, `perf:`.
- **Atomic Auto-Push:** After any file modification: `git add <files>`, `git commit -m "..."`, `git push`.
- **GitHub CLI:** Use pre-authenticated `gh` for repo operations.

### 2. Secrets & Credentials
- **`.env`:** Never commit. `env/*.env.example` are the templates. Populate `env/*.env` locally.
- **Mandatory Sync:** Update `env/*.env.example` whenever `env/*.env` gains a new variable.
- **Privacy:** Never print secrets in logs or commits.

### 3. Development Standards
- **Validation:** `make lint && make test` before every push.
- **Container Rebuild:** `make restart` (i.e. `make down && make up`) after service code changes.
- **CLI sudo:** Use `sudo` only when required; prefer user-level installs.
- **Non-interactive:** Use `-y` / `--yes` flags.
- **Architecture:** Microservice boundaries. SOLID. DRY. KISS. No dead code. No mock data.

### 4. Script Handling
- Helper / throwaway scripts belong in `/tmp/`. Never commit them.
- Persistent tooling belongs in `scripts/`.

### 5. File Search Guidelines
- Skip `node_modules`, `.venv`, `.uv-cache`, `dist`, `build`.
- Respect `.gitignore`.

## Monorepo-Specific Rules

### No `host.docker.internal` in app services
Container-to-container traffic uses the `substrate_internal` bridge network. Service DNS (`gateway`, `ingestion`, `graph`, `postgres`, `keycloak`, `pgadmin`) is the only allowed form. The sole exception is outbound calls to the host's LLM endpoints.

### No polling, no WebSocket, no Redis in application code
SSE over `GET /api/events` is the canonical server→client push transport, backed by Postgres `LISTEN/NOTIFY` + the `sse_events` table. REST is for client-initiated mutations only. The `make lint` grep gate fails if `WebSocket`, `/ws`, `refetchInterval`, or `redis` appear in application code.

### Single data boundary
Ingestion and graph write/read the single `substrate_graph` database. No `substrate_ingestion`. No second DSN env var.

### Shared code lives in `packages/`
- Python: `packages/substrate-common/` owns `config`, `logging`, `errors`, `auth`, `db`, `sse`, `middleware`, `testing.pg`.
- TypeScript: `packages/substrate-web-common/` owns `fetchJson`, `sse`, error types, zod schemas.

Services and apps MUST consume these; duplicating their concerns per-service is a regression.

### Testing: no DB mocks
Integration tests use `testcontainers-python` to spin up real Postgres + AGE + pgvector. Run via `make test`. End-to-end smoke runs on the live compose stack via `make test-e2e`.

## Invariant Docs Update (Mandatory — cross-repo)

Work in this repo is documented in `/home/dany/github/docs/invariant/` (local-only, not part of any git repo) using `YYYY-MM-DD-<description>.md`:

1. **`decisions/`** — Question, options, selected answer, rationale.
2. **`changelog/`** — Title (CL-XXX), date, origin, status, changes made, verification.
3. **`designs/`** — Title (DSG-XXX), date, status, summary, details, recommendation.
4. **`subsystems/`** — Name, role, status, interfaces, dependencies, configuration.

Protocol: Brainstorm (designs) → Ask (decisions) → Identify (subsystems) → Execute (changelog). Update immediately.

## Consistency Mandate

When this file is modified, mirror the relevant changes to `AGENTS.md` and `GEMINI.md` in the same commit.
