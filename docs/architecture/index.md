# Architecture

Substrate Platform follows a **microservices architecture** with clear separation of concerns, event-driven communication, and horizontally scalable components.

---

## Architecture Principles

1. **Event-Driven**: All inter-service communication happens through NATS JetStream
2. **Stateless Services**: Business logic services are stateless; state lives in databases
3. **Graph-First**: The Neo4j graph is the primary data model; relational stores support it
4. **Real-Time by Default**: WebSocket connections stream live updates to clients
5. **Local AI**: All LLM inference runs on self-hosted hardware — no external API calls

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend (Port 3000)"]
        UI[React + WASM Graph Engine]
    end
    
    subgraph Gateway["Gateway (Port 8080)"]
        GW[FastAPI Gateway]
        Auth[JWT Validation]
    end
    
    subgraph Services["Backend Services"]
        ING[Ingestion Service<br/>Port 8081]
        GRAPH[Graph Service<br/>Port 8082]
        RAG[RAG Orchestrator<br/>Port 8083]
    end
    
    subgraph Infrastructure["Infrastructure"]
        NEO4j[(Neo4j<br/>Graph DB)]
        PG[(PostgreSQL<br/>Relational)]
        REDIS[(Redis<br/>Cache)]
        NATS[NATS JetStream<br/>Event Bus]
        KC[Keycloak<br/>Auth]
    end
    
    subgraph AI["AI Inference"]
        VLLM[vLLM<br/>Local LLMs]
    end
    
    UI -->|HTTP/WebSocket| GW
    GW -->|Proxy| ING
    GW -->|Proxy| GRAPH
    GW -->|Proxy| RAG
    
    ING -->|Publish| NATS
    NATS -->|Consume| GRAPH
    
    ING -->|Write| PG
    GRAPH -->|Read/Write| NEO4j
    GRAPH -->|Cache| REDIS
    GRAPH -->|Read| PG
    RAG -->|Query| PG
    RAG -->|Vector Search| PG
    
    RAG -->|LLM Calls| VLLM
    
    GW -->|Validate| KC
```

---

## Service Overview

| Service | Port | Language | Purpose |
|---------|------|----------|---------|
| **Gateway** | 8080 | Python/FastAPI | JWT auth, routing, rate limiting, WebSocket proxy |
| **Ingestion** | 8081 | Python/FastAPI | Connector adapters, job system, scheduler |
| **Graph Service** | 8082 | Python/FastAPI | Graph operations, policy evaluation, drift detection |
| **RAG Orchestrator** | 8083 | Python/FastAPI | Natural language queries, embedding pipelines |
| **Frontend** | 3000 | React/TypeScript | Dashboard UI with WASM graph rendering |

---

## Infrastructure Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Graph Database** | Neo4j 5.x | Architecture graph (nodes, edges, traversals) |
| **Relational DB** | PostgreSQL 16 | Policies, events, embeddings, drift scores |
| **Cache** | Redis 7 | Hot graph snapshots, sessions, rate limiting |
| **Event Bus** | NATS JetStream | At-least-once delivery, stream replay |
| **Identity** | Keycloak | OIDC auth, JWT issuance, SCIM lifecycle |

---

## Data Flow

### Ingestion Pipeline

```mermaid
sequenceDiagram
    participant GitHub
    participant ING as Ingestion Service
    participant PG as PostgreSQL
    participant NATS as NATS JetStream
    participant GRAPH as Graph Service
    participant NEO as Neo4j
    participant REDIS as Redis
    participant WS as WebSocket Clients

    GitHub->>ING: Webhook / API Poll
    ING->>PG: Store raw event
    ING->>ING: Normalize to GraphEvent
    ING->>PG: Store graph event
    ING->>NATS: Publish signals.graph.*
    NATS->>GRAPH: Consume event
    GRAPH->>NEO: MERGE nodes/edges
    GRAPH->>REDIS: Invalidate cache
    GRAPH->>NATS: Publish graph.updates.delta
    GRAPH->>WS: Broadcast delta
```

### Query Flow

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant GW as Gateway
    participant RAG as RAG Orchestrator
    participant PG as PostgreSQL
    participant VLLM as vLLM

    UI->>GW: POST /api/query
    GW->>RAG: Proxy with JWT
    RAG->>PG: Embed query (pgvector)
    RAG->>PG: Retrieve similar chunks
    RAG->>VLLM: Generate with context
    VLLM-->>RAG: Streaming response
    RAG-->>GW: SSE stream
    GW-->>UI: Grounded answer
```

---

## Deployment Architecture

Substrate is designed for **self-hosted first** deployment:

- Docker Compose for development and production
- All components run on customer's infrastructure
- Air-gapped deployment supported with OCI-compliant bundles
- Zero external API dependencies for AI inference

See [Deployment](deployment.md) for detailed deployment patterns.

---

## Next Steps

- [Architecture Overview](overview.md) — Detailed system design
- [Data Model](data-model.md) — Graph and relational schemas
- [Tech Stack](tech-stack.md) — Technology choices and rationale
- [Deployment](deployment.md) — Deployment patterns and configuration
