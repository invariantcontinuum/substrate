# Data Model

Substrate uses a **polyglot persistence** approach with three complementary data stores: Neo4j for graph data, PostgreSQL for relational data and embeddings, and Redis for caching and ephemeral state.

---

## Neo4j Graph Schema

The architecture graph is stored in Neo4j with typed nodes and relationships.

### Node Labels

| Label | Properties | Description |
|-------|------------|-------------|
| **Service** | id, name, domain, language, version, owner, api_type, test_coverage, efferent_coupling, page_rank, betweenness | Microservice or application component |
| **Function** | name, signature, complexity, file, line, language | Code-level function/method |
| **Module** | name, path, language, hash, last_modified | Code module or package |
| **Database** | id, name, domain, status, source, meta | Database resource |
| **Cache** | id, name, domain, status, source, meta | Cache resource (Redis, Memcached) |
| **External** | id, name, domain, status, source, meta | External API or service |
| **InfraResource** | name, type, provider, state, last_observed, region | Infrastructure (VM, container, etc.) |
| **DecisionNode** | title, rationale, date, author, status, review_date, source_url | ADR - Architecture Decision Record |
| **FailurePattern** | description, root_cause, impact, date, source, linked_policy_count | Post-mortem lesson |
| **MemoryNode** | content, type, source, confidence, created_at, author, verified_at | Tribal knowledge capture |
| **Policy** | name, rego_source, enforcement_level, owner, active, version, pack_id | OPA/Rego policy |
| **IntentAssertion** | description, type, source, source_id, confidence, created_at | Declared intent |
| **Developer** | github_handle, name, team, active, scim_id | Team member |
| **Team** | name, keycloak_group_path, parent_team | Organizational unit |
| **SprintNode** | sprint_id, name, start_date, end_date, status, board_id | Project sprint |
| **Community** | level, summary, domain, node_count, updated_at | Leiden cluster |

### Relationship Types

| Edge Type | From → To | Properties | Description |
|-----------|-----------|------------|-------------|
| **CALLS** | Function → Function | count, contexts, last_seen | Function call graph |
| **DEPENDS_ON** | Service → Service | version, import_type, confidence | Service dependency |
| **HOSTS** | InfraResource → Service | port, protocol | Infrastructure mapping |
| **SHOULD_CALL** | Service → Service | via, protocol, enforced_by_policy | Intended dependency |
| **ACTUALLY_CALLS** | Service → Service | direct, via_gateway, last_observed | Observed dependency |
| **GOVERNS** | Policy → Service | enforcement_level | Policy application |
| **WHY** | DecisionNode → Service/Policy | context, rationale_excerpt | Decision rationale |
| **CAUSED** | FailurePattern → Service | severity, date | Incident impact |
| **PREVENTED_BY** | FailurePattern → Policy | date_linked | Lesson → Policy link |
| **OWNS** | Developer/Team → Service | since, primary, confidence | Ownership |
| **MEMBER_OF** | Developer → Team | since, role | Team membership |
| **DOCUMENTS** | Documentation → Service | staleness_score | Documentation link |

### Cypher Examples

```cypher
// Find all services in the payment domain
MATCH (s:Service {domain: 'payment'})
RETURN s.name, s.owner, s.status

// Find blast radius: what depends on the auth service?
MATCH (auth:Service {name: 'auth-service'})<-[:DEPENDS_ON*1..3]-(dependent)
RETURN dependent.name, length(shortestPath((auth)<-[:DEPENDS_ON*]-(dependent))) as hops

// Find WHY a policy exists
MATCH (p:Policy {name: 'api-gateway-first'})<-[:WHY]-(adr:DecisionNode)
RETURN adr.title, adr.rationale, adr.author

// Detect circular dependencies
MATCH path = (s:Service)-[:DEPENDS_ON*3..10]->(s)
RETURN [n in nodes(path) | n.name] as cycle
```

---

## PostgreSQL Schema

### Core Tables

#### nodes
```sql
CREATE TABLE nodes (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT,          -- service | database | cache | external | policy | adr | incident
  status      TEXT,          -- healthy | violation | drift | warning
  domain      TEXT,          -- payment | auth | order | infra | ...
  meta        JSONB,         -- sublabel, version, owner, tags
  source      TEXT,          -- github | k8s | terraform | manual
  first_seen  TIMESTAMPTZ,
  last_seen   TIMESTAMPTZ,
  embedding   vector(1024)   -- pgvector for semantic search
);
```

#### edges
```sql
CREATE TABLE edges (
  id          UUID PRIMARY KEY,
  source_id   UUID REFERENCES nodes(id),
  target_id   UUID REFERENCES nodes(id),
  type        TEXT,          -- depends | why | enforces | violation | drift
  label       TEXT,
  weight      FLOAT DEFAULT 1.0,   -- Hebbian-style, strengthened on retrieval hits
  meta        JSONB,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
);
```

#### adrs
```sql
CREATE TABLE adrs (
  id          UUID PRIMARY KEY,
  adr_id      TEXT UNIQUE,   -- ADR-023
  title       TEXT,
  context     TEXT,
  decision    TEXT,
  consequences TEXT,
  status      TEXT,          -- active | superseded | deprecated
  author      TEXT,
  created_at  TIMESTAMPTZ,
  embedding   vector(1024)
);
```

#### incidents
```sql
CREATE TABLE incidents (
  id          UUID PRIMARY KEY,
  incident_id TEXT UNIQUE,   -- POST-042
  title       TEXT,
  summary     TEXT,
  severity    TEXT,          -- P0 | P1 | P2 | P3
  occurred_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  embedding   vector(1024)
);
```

#### policies
```sql
CREATE TABLE policies (
  id          UUID PRIMARY KEY,
  policy_id   TEXT UNIQUE,   -- POLICY-004
  name        TEXT,
  description TEXT,
  rego_source TEXT,          -- raw Rego policy text
  status      TEXT,          -- active | draft | disabled
  severity    TEXT,          -- block | warn | info
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ
);
```

#### policy_evaluations
```sql
CREATE TABLE policy_evaluations (
  id            UUID PRIMARY KEY,
  policy_id     UUID REFERENCES policies(id),
  trigger_type  TEXT,        -- pr | push | manual | schedule
  trigger_ref   TEXT,        -- PR number, commit SHA, etc.
  outcome       TEXT,        -- pass | block | warn
  input_snapshot JSONB,      -- graph state at evaluation time
  violations    JSONB,       -- array of violation details
  evaluated_at  TIMESTAMPTZ
);
```

#### drift_scores
```sql
CREATE TABLE drift_scores (
  id            UUID PRIMARY KEY,
  score         FLOAT,       -- 0.0 (perfect) to 1.0 (total divergence)
  convergences  JSONB,       -- nodes/edges in both G_I and G_R
  divergences   JSONB,       -- in G_R but not G_I
  absences      JSONB,       -- in G_I but not G_R
  computed_at   TIMESTAMPTZ
);
```

#### job_runs
```sql
CREATE TABLE job_runs (
  id          UUID PRIMARY KEY,
  job_type    TEXT NOT NULL, -- sync | ingest | analyze
  scope       JSONB,         -- {repo_url, owner, repo} etc.
  status      TEXT,          -- pending | running | completed | failed
  progress    JSONB,         -- {done: N, total: M}
  result      JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ,
  started_at  TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

#### why_edges
```sql
CREATE TABLE why_edges (
  id          UUID PRIMARY KEY,
  source_type TEXT,          -- adr | incident
  source_id   UUID,          -- references adrs or incidents
  target_type TEXT,          -- policy | node | edge
  target_id   UUID,
  label       TEXT,
  created_at  TIMESTAMPTZ
);
```

### Partitioning

**drift_scores** is partitioned by month for efficient time-series queries:

```sql
-- Using pg_partman
SELECT partman.create_parent('public.drift_scores', 'computed_at', 'native', 'monthly');
```

### Indexes

```sql
-- Vector similarity search
CREATE INDEX ON nodes USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON adrs USING ivfflat (embedding vector_cosine_ops);

-- Graph traversal
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);

-- Time-series queries
CREATE INDEX idx_drift_scores_time ON drift_scores(computed_at DESC);
CREATE INDEX idx_policy_eval_time ON policy_evaluations(evaluated_at DESC);

-- Full-text search
CREATE INDEX idx_nodes_fts ON nodes USING gin(to_tsvector('english', name || ' ' || COALESCE(meta->>'description', '')));
```

---

## Redis Key Taxonomy

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `graph:snapshot` | 60s | Hot graph snapshot (JSON) |
| `cache:deps:{service_id}:{depth}` | Until graph update | Service dependency tree |
| `cache:blast:{node_id}` | 30min | Blast radius computation result |
| `session:{user_id}` | 30min | WebSocket session state |
| `lock:pr:{pr_id}` | 60s | Distributed lock for PR processing |
| `lock:infra:{workspace}` | 120s | Distributed lock for Terraform parsing |
| `result:pr:{sha256}` | Until next commit | Deduplication: code graph delta |
| `vllm:prefix:{hash}` | 2h | vLLM prefix KV cache backing |

---

## Data Retention

| Data Type | Retention | Storage |
|-----------|-----------|---------|
| Drift scores | 12 months | PostgreSQL (partitioned) |
| Policy violations | Indefinite | PostgreSQL (compliance) |
| Institutional memory | Indefinite | Neo4j |
| Agent audit log | Indefinite | PostgreSQL (append-only) |
| Simulation results | 90 days | PostgreSQL |
| Activity logs | 12 months | PostgreSQL |
| NATS streams | 7 days | NATS JetStream |
| Redis sessions | 30 minutes | Redis (TTL) |
