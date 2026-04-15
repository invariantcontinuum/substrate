# Infrastructure

Substrate's infrastructure layer provides data persistence, caching, messaging, and identity services.

---

## Overview

| Component | Technology | Purpose | Port |
|-----------|------------|---------|------|
| Graph Database | Neo4j 5.16 | Architecture graph | 7687 |
| Relational Database | PostgreSQL 16 | Policies, events, embeddings | 5432 |
| Cache | Redis 7 | Hot snapshots, sessions | 6379 |
| Event Bus | NATS 2.10 | Inter-service messaging | 4222 |
| Identity | Keycloak | OIDC, JWT, SCIM | 8080 |

---

## Neo4j

### Role
Primary graph database storing architecture nodes, edges, and their relationships.

### Configuration

```yaml
# neo4j.conf
server.memory.heap.initial_size=2G
server.memory.heap.max_size=4G
server.memory.pagecache.size=4G

# Enable APOC
dbms.security.procedures.unrestricted=apoc.*
```

### Schema Constraints

```cypher
-- Node uniqueness
CREATE CONSTRAINT service_id FOR (s:Service) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT database_id FOR (d:Database) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT cache_id FOR (c:Cache) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT external_id FOR (e:External) REQUIRE e.id IS UNIQUE;

-- Indexes
CREATE INDEX service_name FOR (s:Service) ON (s.name);
CREATE INDEX service_domain FOR (s:Service) ON (s.domain);
CREATE INDEX node_status FOR (n) ON (n.status);
```

### Backup

```bash
# Online backup (Enterprise)
neo4j-admin backup --from=localhost --backup-dir=/backups/neo4j

# Offline dump (Community)
neo4j-admin database dump neo4j --to-path=/backups/neo4j.dump
```

---

## PostgreSQL

### Role
Relational database for policies, events, drift scores, embeddings, and audit logs.

### Databases

| Database | Owner | Purpose |
|----------|-------|---------|
| `substrate_ingestion` | substrate_ingestion | Ingestion service data |
| `substrate_graph` | substrate_graph | Graph service data |

### Extensions

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS age;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_partman;
```

### Partitioning

```sql
-- Partition drift_scores by month
SELECT partman.create_parent(
    'public.drift_scores',
    'computed_at',
    'native',
    'monthly'
);
```

### Connection Pooling

Recommended: PgBouncer for production

```ini
[databases]
substrate_graph = host=localhost port=5432 dbname=substrate_graph

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
max_client_conn = 1000
default_pool_size = 25
```

---

## Redis

### Role
Caching layer for hot graph snapshots, session state, rate limiting, and distributed locks.

### Configuration

```bash
# redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

### Key Patterns

| Pattern | Description | TTL |
|---------|-------------|-----|
| `graph:snapshot` | Full graph JSON | 60s |
| `cache:deps:{id}:{depth}` | Dependency tree | On update |
| `session:{user_id}` | User session | 30min |
| `lock:{resource}` | Distributed lock | 60s |
| `vllm:prefix:{hash}` | LLM KV cache | 2h |

### Persistence

- AOF (Append-Only File) enabled
- RDB snapshots every 60 seconds
- Rewrites triggered at 100% growth

---

## NATS JetStream

### Role
Event bus for inter-service communication with at-least-once delivery and stream replay.

### Streams

```javascript
// signals stream
{
  name: "signals",
  subjects: ["signals.graph.*", "signals.infra.*"],
  retention: "limits",
  max_msgs: 1_000_000,
  max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days
  storage: "file"
}

// updates stream
{
  name: "updates",
  subjects: ["graph.updates.*"],
  retention: "limits",
  max_msgs: 100_000,
  max_age: 24 * 60 * 60 * 1_000_000_000, // 1 day
  storage: "memory"
}
```

### Consumers

```javascript
// Graph service consumer
{
  name: "graph-service",
  stream: "signals",
  deliver_policy: "all",
  ack_policy: "explicit",
  ack_wait: 30_000_000_000, // 30s
  max_deliver: 5
}
```

### Subject Hierarchy

```
signals.graph.github.push
signals.graph.github.pr_merge
signals.graph.k8s.deployment
signals.graph.terraform.apply
graph.updates.delta
graph.updates.stats
```

---

## Keycloak

### Role
Identity provider for OIDC authentication, JWT issuance, and user lifecycle management.

### Realm Configuration

```json
{
  "realm": "substrate",
  "enabled": true,
  "sslRequired": "external",
  "registrationAllowed": false,
  "clients": [
    {
      "clientId": "substrate-frontend",
      "publicClient": true,
      "redirectUris": ["http://localhost:3000/*"],
      "webOrigins": ["http://localhost:3000"],
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": false
    },
    {
      "clientId": "substrate-gateway",
      "publicClient": false,
      "clientAuthenticatorType": "client-secret",
      "serviceAccountsEnabled": true
    }
  ],
  "roles": {
    "realm": [
      { "name": "admin" },
      { "name": "architect" },
      { "name": "developer" },
      { "name": "viewer" }
    ]
  }
}
```

### SCIM Integration

```json
{
  "enabled": true,
  "endpoint": "/scim/v2",
  "clientId": "substrate-scim",
  "createUserEvent": true,
  "deleteUserEvent": true
}
```

SCIM events trigger Substrate graph mutations:
- `POST /Users` → Create Developer node
- `PATCH /Users/{id}` (active=false) → Deactivate, run key-person risk scan

---

## Resource Requirements

### Development

| Component | CPU | Memory | Storage |
|-----------|-----|--------|---------|
| Neo4j | 2 cores | 4 GB | 50 GB |
| PostgreSQL | 2 cores | 2 GB | 20 GB |
| Redis | 0.5 cores | 512 MB | 10 GB |
| NATS | 1 core | 512 MB | 10 GB |
| Keycloak | 1 core | 1 GB | 5 GB |

### Production

| Component | CPU | Memory | Storage |
|-----------|-----|--------|---------|
| Neo4j | 8 cores | 16 GB | 500 GB SSD |
| PostgreSQL | 4 cores | 8 GB | 200 GB SSD |
| Redis | 2 cores | 2 GB | 50 GB |
| NATS | 2 cores | 2 GB | 100 GB |
| Keycloak | 2 cores | 2 GB | 20 GB |

---

## Health Checks

### Neo4j

```bash
cypher-shell -u neo4j -p $PASSWORD "RETURN 1"
```

### PostgreSQL

```bash
pg_isready -U postgres -h localhost
```

### Redis

```bash
redis-cli ping
# Expected: PONG
```

### NATS

```bash
nats server check
```

### Keycloak

```bash
curl http://localhost:8080/health/ready
```

---

## Backup Strategy

### Neo4j
- Daily online backups (Enterprise)
- Weekly offline dumps (Community)
- Retention: 30 days

### PostgreSQL
- Continuous WAL archiving
- Daily full backups
- Point-in-time recovery

### Redis
- AOF rewrite every hour
- RDB snapshot daily
- Replication to secondary

### NATS
- Stream replication
- Periodic stream snapshots

---

## Security

### Network
- All inter-service traffic over internal Docker network
- No external exposure except Gateway (8080) and Keycloak (8080)
- TLS enabled for all connections

### Data at Rest
- PostgreSQL: AES-256 encryption
- Neo4j: Native encryption
- Redis: No sensitive data (ephemeral)

### Access Control
- Database users per service
- Minimal privileges
- No superuser access from applications
