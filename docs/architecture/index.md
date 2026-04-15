# Architecture

Substrate Platform follows a **microservices architecture** with clear separation of concerns. The current implementation focuses on GitHub source ingestion, graph visualization, and semantic search.

---

## Architecture Principles

1. **No Mock Data**: Every node and edge comes from real repository analysis
2. **Stateless Services**: Business logic services are stateless; state lives in PostgreSQL
3. **Graph-First**: The Apache AGE graph inside PostgreSQL is the primary graph model
4. **Real-Time by Default**: WebSocket connections stream live updates to clients
5. **Local AI**: All LLM inference runs on self-hosted hardware — no external API calls

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend (Port 3000)"]
        UI[React + Cytoscape.js]
    end

    subgraph Gateway["Gateway (Port 8080)"]
        GW[FastAPI Gateway]
        Auth[JWT Validation]
    end

    subgraph Services["Backend Services"]
        ING[Ingestion Service<br/>Port 8081]
        GRAPH[Graph Service<br/>Port 8082]
    end

    subgraph Infrastructure["Infrastructure"]
        PG[(PostgreSQL 16)]
        AGE[Apache AGE]
        VEC[pgvector]
        KC[Keycloak<br/>Auth]
    end

    subgraph AI["AI Inference"]
        LLM[lazy-lamacpp<br/>Local LLMs]
    end

    UI -->|HTTP / WS| GW
    GW -->|/ingest/*| ING
    GW -->|/api/*| GRAPH
    GW -->|/auth/*| KC

    ING -->|Write| PG
    ING -->|Write| AGE
    GRAPH -->|Read| PG
    GRAPH -->|Cypher| AGE

    ING -->|Embed| LLM
    GRAPH -->|Embed / Generate| LLM
```

---

## Service Overview

| Service | Port | Language | Purpose |
|---------|------|----------|---------|
| **Gateway** | 8080 | Python/FastAPI | JWT auth, routing, WebSocket proxy |
| **Ingestion** | 8081 | Python/FastAPI | GitHub connector, sync orchestration, embeddings |
| **Graph Service** | 8082 | Python/FastAPI | Graph queries, semantic search, LLM summaries |
| **Frontend** | 3000 | React/TypeScript | Dashboard UI with Cytoscape graph |

---

## Infrastructure Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Primary Database** | PostgreSQL 16 | Relational data, embeddings, graph queries |
| **Graph Extension** | Apache AGE | Cypher graph queries inside PostgreSQL |
| **Vector Extension** | pgvector | 1024-dimensional embeddings |
| **Identity** | Keycloak | OIDC auth, JWT issuance |
| **AI Inference** | lazy-lamacpp | Local embedding and dense LLM serving |

---

## Data Flow

### Ingestion Pipeline

```mermaid
sequenceDiagram
    participant GitHub
    participant ING as Ingestion Service
    participant PG as PostgreSQL
    participant AGE as Apache AGE
    participant LLM as lazy-lamacpp

    GitHub->>ING: git clone --depth 1
    ING->>ING: Discover & classify files
    ING->>ING: Parse imports / includes
    ING->>PG: Write file_embeddings
    ING->>PG: Write content_chunks
    ING->>AGE: Write File nodes & depends_on edges
    ING->>LLM: Batch embed summaries
    ING->>PG: Backfill embeddings
    ING->>LLM: Batch embed chunks
    ING->>PG: Backfill chunk embeddings
```

### Query Flow

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant GW as Gateway
    participant GRAPH as Graph Service
    participant PG as PostgreSQL
    participant AGE as Apache AGE
    participant LLM as lazy-lamacpp

    UI->>GW: GET /api/graph?sync_ids=...
    GW->>GRAPH: Proxy with JWT
    GRAPH->>PG: Query merged snapshot
    GRAPH->>AGE: Query edges
    GRAPH-->>GW: Nodes + edges
    GW-->>UI: Graph snapshot

    UI->>GW: GET /api/graph/search?q=...
    GW->>GRAPH: Proxy with JWT
    GRAPH->>LLM: Embed query
    GRAPH->>PG: pgvector similarity search
    GRAPH-->>GW: Search results
    GW-->>UI: Results
```

---

## Deployment Architecture

Substrate is designed for **self-hosted first** deployment:

- Docker Compose for development and production
- All components run on customer's infrastructure
- Zero external API dependencies for AI inference
- Infrastructure provided by `home-stack` (PostgreSQL, Keycloak)

See [Deployment](deployment.md) for detailed deployment patterns.

---

## Next Steps

- [Architecture Overview](overview.md) — Detailed system design
- [Data Model](data-model.md) — Graph and relational schemas
- [Tech Stack](tech-stack.md) — Technology choices and rationale
- [Deployment](deployment.md) — Deployment patterns and configuration
