# Technology Stack

Substrate uses a carefully curated technology stack optimized for performance, maintainability, and local AI inference.

---

## Core Services

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Gateway | Python + FastAPI | 3.12 | API gateway, auth, routing, WS proxy |
| Ingestion | Python + FastAPI | 3.12 | Sync orchestration, GitHub connector, embeddings |
| Graph | Python + FastAPI | 3.12 | Graph queries, search, summaries |
| Frontend | React + TypeScript | 18 / 5.x | Dashboard UI |

### Python Stack

```toml
# Core dependencies
fastapi = "^0.115"
uvicorn = { extras = ["standard"], version = "^0.34" }
pydantic = "^2.10"
pydantic-settings = "^2.0"

# Database
asyncpg = "^0.30"
psycopg = { extras = ["binary", "pool"], version = "^3.2" }

# HTTP
httpx = "^0.28"
websockets = "^15.0"

# Auth
pyjwt = "^2.10"
cryptography = "^44.0"

# Logging
structlog = "^25.0"

# Testing
pytest = "^8.3"
pytest-asyncio = "^0.25"
```

### Frontend Stack

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.0",
    "@tanstack/react-query": "^5.96.2",
    "zustand": "^5.0.12",
    "react-oidc-context": "^3.3.1",
    "oidc-client-ts": "^3.1.0",
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
    "@testing-library/react": "^16.2"
  }
}
```

---

## Infrastructure

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Primary Database | PostgreSQL | 16 | Relational data, embeddings, graph queries |
| Graph Extension | Apache AGE | latest | Cypher graph queries inside PostgreSQL |
| Vector Extension | pgvector | latest | 1024-dimensional embeddings |
| Identity | Keycloak | latest | OIDC, JWT issuance |

**Note:** While Redis and NATS are mentioned in early architectural planning, the current implementation uses direct service-to-service HTTP calls and shared PostgreSQL. Redis is configured in the Gateway but unused in the current code.

### PostgreSQL Extensions

```sql
-- Graph queries via Cypher
CREATE EXTENSION IF NOT EXISTS age;

-- Vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## AI/ML Stack

All AI inference runs **locally** via `lazy-lamacpp` (llama.cpp server endpoints).

| Model | Port | Purpose |
|-------|------|---------|
| `Qwen3-Embedding-0.6B-Q8_0.gguf` | 8101 | File and chunk embeddings (1024-dim) |
| `qwen2.5-7b-instruct` | 8102 | File summaries and dense reasoning |

### Embedding Configuration

```python
EMBEDDING_URL = "http://localhost:8101/v1/embeddings"
EMBEDDING_MODEL = "Qwen3-Embedding-0.6B-Q8_0.gguf"
EMBEDDING_DIM = 1024
```

### Summary LLM Configuration

```python
DENSE_LLM_URL = "http://localhost:8102/v1/chat/completions"
DENSE_LLM_MODEL = "qwen2.5-7b-instruct"
SUMMARY_MAX_TOKENS = 160
```

---

## Graph Rendering

| Component | Technology | Purpose |
|-----------|------------|---------|
| Engine | Cytoscape.js | Client-side graph rendering |
| Layout | `cose` (Compound Spring Embedder) | Force-directed layout |
| Fallback | `grid` | Used when >200 nodes for performance |

**Future:** The `@invariantcontinuum/graph` WASM+WebGL package is under active development to replace Cytoscape.js for larger graph performance.

---

## Development Tools

| Tool | Purpose |
|------|---------|
| uv | Python environment management |
| hatchling | Python build backend |
| Ruff | Python linting and formatting |
| Vite | Frontend build tool |
| Vitest | Frontend testing |

---

## Browser Support

**Modern evergreen browsers:**

| Browser | Minimum Version |
|---------|-----------------|
| Chrome/Edge | 90+ |
| Firefox | 90+ |
| Safari | 16+ |

**Required Features:**
- ES2022
- CSS custom properties
- IntersectionObserver (for infinite scroll)

---

## Licensing

All core dependencies are open-source with permissive licenses:

| Dependency | License |
|------------|---------|
| PostgreSQL | PostgreSQL License |
| Apache AGE | Apache 2.0 |
| pgvector | PostgreSQL License |
| Keycloak | Apache 2.0 |
| FastAPI | MIT |
| React | MIT |
| Cytoscape.js | MIT |
| cytoscape-cose-bilkent | MIT | *Installed but not currently imported* |
