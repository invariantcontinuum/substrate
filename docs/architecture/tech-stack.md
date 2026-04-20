# Technology Stack

Substrate's stack is optimized for performance, maintainability, and fully-local AI inference.

---

## Core services

| Component | Technology | Purpose |
|---|---|---|
| Gateway | Python 3.12 + FastAPI | JWT auth, HTTP proxy, SSE fan-out |
| Ingestion | Python 3.12 + FastAPI | Sync orchestration, tree-sitter parsing, embeddings |
| Graph | Python 3.12 + FastAPI | Graph queries, semantic search, enriched summaries |
| Frontend | React 19 + TypeScript 5 + Vite | Dashboard UI |

### Python stack

```toml
# Core
fastapi        = "^0.115"
uvicorn        = { extras = ["standard"], version = "^0.34" }
pydantic       = "^2.10"
pydantic-settings = "^2.0"

# Database
asyncpg        = "^0.30"
psycopg        = { extras = ["binary", "pool"], version = "^3.2" }

# HTTP
httpx          = "^0.28"

# Auth
pyjwt          = "^2.10"
cryptography   = "^44.0"

# Parsing / chunking (substrate-graph-builder)
tree-sitter              = "^0.25"
tree-sitter-language-pack = "*"

# Logging
structlog      = "^25.0"

# Testing
pytest         = "^8.3"
pytest-asyncio = "^0.25"
testcontainers = "^4.0"     # real Postgres + AGE + pgvector for integration tests
```

There is **no Redis** in the Python dependency tree — the `make lint` banned-token gate fails the build if `redis`, `WebSocket`, `/ws`, or `refetchInterval` appear in application code.

### Frontend stack

```json
{
  "dependencies": {
    "react": "^19.2",
    "react-dom": "^19.2",
    "react-router-dom": "^7.0",
    "@tanstack/react-query": "^5.96",
    "zustand": "^5.0",
    "react-oidc-context": "^3.3",
    "oidc-client-ts": "^3.1",
    "cytoscape": "^3.30",
    "lucide-react": "^0.474",
    "@base-ui/react": "^1.0",
    "clsx": "^2.1",
    "tailwindcss": "^4.0"
  },
  "devDependencies": {
    "vite": "^6.1",
    "typescript": "^5.7",
    "vitest": "^3.0",
    "@testing-library/react": "^16.2",
    "knip": "*"
  }
}
```

Server→client push uses the browser's native `EventSource` against `GET /api/events`. No WebSocket client library.

---

## Infrastructure

| Component | Technology | Purpose |
|---|---|---|
| Primary DB | PostgreSQL 16 | Relational + embeddings + graph |
| Graph extension | Apache AGE | Cypher inside Postgres |
| Vector extension | pgvector | 896-dim embeddings |
| Identity | Keycloak 26 | OIDC, JWT issuance, realm imported from template |
| Edge proxy (prod) | nginx-proxy-manager (home-stack) | TLS termination, hostname routing |

Substrate does **not** bundle a reverse proxy. Prod TLS is handled by home-stack's NPM, which auto-provisions proxy hosts (see `home-stack/services/nginx-proxy-manager/init-proxy-hosts.sh`).

### PostgreSQL extensions

```sql
CREATE EXTENSION IF NOT EXISTS age;      -- Cypher graph queries
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector (896-dim)
```

---

## Shared Python package — `substrate-graph-builder`

Lives at `packages/substrate-graph-builder/`. Consumed by ingestion.

Responsibilities:
- Per-language tree-sitter plugins (15 languages: C, C++, C#, Go, Java, JavaScript, Kotlin, Perl, PHP, Python, Ruby, Rust, Shell, TypeScript, CMake)
- `REGISTRY.get_for_path(path)` → plugin lookup by extension or filename
- `build_graph()` → imports + symbols + resolved cross-file edges
- `chunker.chunk_content()` → dispatcher that routes files to:
  - AST chunker (generic over any tree-sitter grammar)
  - Markdown chunker (heading-aware, fence-preserving)
  - Text chunker (paragraph-aware)
  - Line-greedy fallback (unknown extensions)

Each chunk carries `chunk_type` (function/class/method/interface/impl/module/heading/paragraph/line/block), `symbols` (identifier list), line range, and a contextual breadcrumb header prefix (`# file: …\n# in: <ancestor chain>`).

---

## AI/ML stack

All inference runs **locally** via lazy-lamacpp (llama.cpp server processes).

| Role | Model | Port | Notes |
|---|---|---|---|
| Embeddings | jina-code-embeddings-0.5b Q8_0 | 8101 | 896-dim, 32 k context, supports `search_document:` / `search_query:` prefix scheme |
| Dense chat | Qwen3.5-2B Q8_0 GGUF | 8102 | 60 k context, thinking disabled for summaries |

Both models must fit simultaneously in the Quadro P1000's 4 GB VRAM budget — see `ops/llm/lazy-lamacpp/AGENTS.md` for the VRAM accounting.

### Embedding configuration

```python
# .env.<mode> (shared between dev and prod)
EMBEDDING_URL   = "http://host.docker.internal:8101/v1/embeddings"
EMBEDDING_MODEL = "embeddings"      # lazy-lamacpp systemd-unit name
EMBEDDING_DIM   = 896
```

### Summary LLM configuration

```python
DENSE_LLM_URL      = "http://host.docker.internal:8102/v1/chat/completions"
DENSE_LLM_MODEL    = "dense"
SUMMARY_MAX_TOKENS = 400           # dense output cap
# Context-window retry: full → 50% → 25% budget on HTTP 400 with
# a context-overflow error, before giving up and returning source="llm_failed".
```

---

## Graph rendering

| Component | Technology | Purpose |
|---|---|---|
| Engine | Cytoscape.js | Client-side graph rendering |
| Layout | `cose` (Compound Spring Embedder) | Force-directed |
| Fallback | `grid` | Used when filtered node count > 200 |

A WASM+WebGL engine under `packages/graph-ui/` is being developed; not adopted yet.

---

## Development tools

| Tool | Purpose |
|---|---|
| uv | Python env + dependency management |
| hatchling | Python build backend |
| ruff | Python linting + formatting |
| mypy | Python type-check |
| vulture | Dead-code sweep (Python) |
| pnpm | Frontend package manager |
| tsc + eslint + knip | TypeScript + ESLint + dead-export sweep |
| Vite | Frontend dev server + bundler |
| Vitest | Frontend testing |

`make lint` runs all of them plus a banned-token grep; `make test` runs pytest + vitest; `make check-contracts` diffs pydantic vs zod JSON schemas for `Event` and `ErrorResponse`.

---

## Browser support

**Modern evergreen browsers.**

| Browser | Minimum |
|---|---|
| Chrome/Edge | 90+ |
| Firefox | 90+ |
| Safari | 16+ |

Required features: ES2022, CSS custom properties, `EventSource`, `IntersectionObserver`.

---

## Licensing

All core dependencies are open-source, permissive.

| Dependency | License |
|---|---|
| PostgreSQL | PostgreSQL License |
| Apache AGE | Apache 2.0 |
| pgvector | PostgreSQL License |
| Keycloak | Apache 2.0 |
| FastAPI | MIT |
| React | MIT |
| Cytoscape.js | MIT |
| tree-sitter | MIT |
| tree-sitter-language-pack | MIT |
| nginx-proxy-manager | MIT |
| Traefik | *(not used — see deployment.md)* |
