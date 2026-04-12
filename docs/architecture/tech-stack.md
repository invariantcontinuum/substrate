# Technology Stack

Substrate uses a carefully curated technology stack optimized for performance, maintainability, and local AI inference.

---

## Core Services

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Gateway | Python + FastAPI | 3.12 | API gateway, auth, routing |
| Ingestion | Python + FastAPI | 3.12 | Connector adapters, jobs |
| Graph | Python + FastAPI | 3.12 | Graph operations, policies |
| RAG | Python + FastAPI | 3.12 | Natural language queries |
| Frontend | React + TypeScript | 19 / 5.3 | Dashboard UI |

### Python Stack

```toml
# Core dependencies
fastapi = "^0.115"
uvicorn = { extras = ["standard"], version = "^0.34" }
pydantic = "^2.10"

# Database
neo4j = "^5.28"
psycopg = { extras = ["binary", "pool"], version = "^3.2" }
redis = "^5.2"

# Messaging
nats-py = { extras = ["jetstream"], version = "^2.9" }
celery = { extras = ["redis"], version = "^5.4" }

# HTTP
httpx = "^0.28"

# Auth
python-jose = { extras = ["cryptography"], version = "^3.3" }
python-keycloak = "^5.3"

# Embeddings
sentence-transformers = "^3.4"
```

### Frontend Stack

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.2",
    "@tanstack/react-query": "^5.66",
    "zustand": "^5.0.3",
    "react-oidc-context": "^3.2.0",
    "@invariantcontinuum/graph": "latest",
    "tailwindcss": "^4.0",
    "framer-motion": "^12.4"
  },
  "devDependencies": {
    "vite": "^6.1",
    "typescript": "^5.7",
    "@types/react": "^19.0"
  }
}
```

---

## Infrastructure

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Graph Database | Neo4j | 5.16 | Architecture graph |
| Relational DB | PostgreSQL | 16 | Policies, events, embeddings |
| Cache | Redis | 7 | Hot snapshots, sessions |
| Event Bus | NATS | 2.10 | JetStream messaging |
| Identity | Keycloak | latest | OIDC, JWT, SCIM |

### PostgreSQL Extensions

```sql
-- Graph queries (alternative to Neo4j for some use cases)
CREATE EXTENSION age;

-- Vector embeddings
CREATE EXTENSION vector;

-- Time-series partitioning
CREATE EXTENSION pg_partman;
```

---

## AI/ML Stack

All AI inference runs **locally** on self-hosted hardware (NVIDIA DGX Spark or equivalent).

| Model | Size | Port | Purpose |
|-------|------|------|---------|
| Llama 4 Scout (MoE) | 109B / 17B active | 8000 | Global reasoning, simulation |
| Dense 70B + Multi-LoRA | 70B | 8001 | Extraction, explanation, NL→Cypher |
| Qwen2.5-Coder | 32B | 8002 | Fix PR generation, AST enrichment |
| BGE-M3 | - | 8003 | All embeddings |
| bge-reranker-v2-m3 | - | 8004 | Hybrid search reranking |
| SDXL + ControlNet | - | 8005 | Visualizations (on-demand) |

### vLLM Configuration

```bash
# Llama 4 Scout (always resident)
vllm serve meta-llama/Llama-4-Scout-17B-16E \
  --port 8000 \
  --tensor-parallel-size 1 \
  --max-model-len 128000 \
  --quantization fp4

# Dense 70B + Multi-LoRA (always resident)
vllm serve meta-llama/Llama-3.3-70B-Instruct \
  --port 8001 \
  --enable-lora \
  --lora-modules extract:./adapters/extract resolve:./adapters/resolve
```

---

## Graph Rendering

| Component | Technology | Purpose |
|-----------|------------|---------|
| Engine | Rust + WASM | Core graph engine |
| Rendering | WebGL2 | GPU-accelerated rendering |
| Layout | Barnes-Hut N-body | Force-directed positioning |
| Text | MSDF | Signed distance field fonts |

### Rust Workspace Structure

```
graph/
├── graph-core/      # Data structures, algorithms
├── graph-layout/    # Position computation
├── graph-render/    # WebGL2 rendering
└── graph-wasm/      # WASM bindings
```

### Key Rust Dependencies

```toml
[dependencies]
petgraph = "0.7"          # Graph data structures
wasm-bindgen = "0.2"      # JS interop
web-sys = "0.3"           # Browser APIs
nalgebra = "0.33"         # Linear algebra
rayon = "1.10"            # Parallelism (native)
```

---

## Development Tools

| Tool | Purpose |
|------|---------|
| uv | Python environment management |
| Ruff | Python linting and formatting |
| Flyway | PostgreSQL migrations |
| neo4j-migrations | Neo4j migrations |
| Vite | Frontend build tool |
| wasm-pack | Rust/WASM build |

---

## Browser Support

**Modern evergreen only:**

| Browser | Minimum Version |
|---------|-----------------|
| Chrome/Edge | 90+ |
| Firefox | 90+ |
| Safari | 16+ |

**Required Features:**
- WebGL2
- WASM SIMD
- SharedArrayBuffer
- ES2022

---

## Licensing

All dependencies are open-source with permissive licenses:

| Dependency | License |
|------------|---------|
| PostgreSQL | PostgreSQL License |
| Redis | BSD 3-Clause |
| NATS | Apache 2.0 |
| Keycloak | Apache 2.0 |
| Neo4j (Community) | GPL v3 |
| OPA | Apache 2.0 |
| pgvector | PostgreSQL License |
| vLLM | Apache 2.0 |
| BGE-M3 | MIT |
| Llama 4 | Meta Llama 4 Community License |
