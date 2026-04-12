# Deployment

Substrate is designed for **self-hosted first** deployment with support for development, production, and air-gapped environments.

---

## Deployment Modes

### Development Mode
- Single machine (laptop or workstation)
- Docker Compose with all services
- Local AI via Ollama (CPU) or vLLM (GPU if available)

### Production Mode
- Docker Compose on dedicated server
- NVIDIA DGX Spark or equivalent for AI inference
- Separate infrastructure and application services

### Air-Gapped Mode
- Zero internet connectivity required
- OCI-compliant container bundle
- Ed25519-signed license validation

---

## Docker Compose Structure

```yaml
# compose.yaml - Application Services Only
services:
  gateway:
    build: ./services/gateway
    ports: ["8080:8080"]
    networks: [substrate, local-infra-network]
    environment:
      KEYCLOAK_URL: http://local-keycloak:8080
      REDIS_URL: redis://local-redis:6379

  ingestion:
    build: ./services/ingestion
    ports: ["8081:8081"]
    networks: [substrate, local-infra-network]
    environment:
      NATS_URL: nats://local-nats-1:4222
      DATABASE_URL: postgresql+asyncpg://.../substrate_ingestion

  graph-service:
    build: ./services/graph
    ports: ["8082:8082"]
    networks: [substrate, local-infra-network]
    environment:
      NEO4J_URL: bolt://local-neo4j:7687
      NATS_URL: nats://local-nats-1:4222
      REDIS_URL: redis://local-redis:6379

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    networks: [substrate]
    environment:
      VITE_API_URL: http://localhost:8080

networks:
  substrate:
    driver: bridge
  local-infra-network:
    external: true  # Provided by home-stack
```

---

## Infrastructure Requirements

### Minimum (Development)

| Resource | Specification |
|----------|---------------|
| CPU | 8 cores |
| RAM | 32 GB |
| Storage | 100 GB SSD |
| GPU | Optional |

### Recommended (Production)

| Resource | Specification |
|----------|---------------|
| CPU | 16+ cores |
| RAM | 128 GB (DGX Spark unified memory) |
| Storage | 500 GB NVMe SSD |
| GPU | NVIDIA DGX Spark (GB10 Grace Blackwell) |

### DGX Spark Memory Allocation

| Allocation | Size | Mode |
|------------|------|------|
| OS + vLLM overhead | 8.0 GB | Fixed |
| Llama 4 Scout (MoE, FP4) | 55.0 GB | Always resident |
| Dense 70B + Multi-LoRA (FP8) | 38.0 GB | Always resident |
| BGE-M3 embedding | 0.6 GB | Always resident |
| bge-reranker-v2-m3 | 0.3 GB | Always resident |
| KV cache pool (FP8, 128k context) | 26.1 GB | Dynamic |
| Qwen2.5-Coder-32B (on-demand) | 18.0 GB | Load on demand |

---

## Deployment Split: Bare Metal vs Container

Due to the GB10 unified memory architecture, vLLM endpoints run **bare metal** while other services run in containers:

| Component | Deployment | Reason |
|-----------|------------|--------|
| vLLM endpoints | systemd | NUMA-aware allocation required |
| Neo4j | Docker | Stateful, no GPU dependency |
| PostgreSQL | Docker | Clean extension management |
| Redis | Docker | Standard deployment |
| NATS | Docker | Lightweight, no GPU |
| All Substrate services | Docker | Stateless, portable |

---

## Startup Sequence

```bash
# 1. Start infrastructure (home-stack)
cd ~/github/danycrafts/home-stack
docker compose up -d

# 2. Wait for health checks
./scripts/wait-for-infra.sh

# 3. Run migrations
make migrate

# 4. Start Substrate services
cd ~/github/invariantcontinuum/substrate-platform
docker compose up -d

# 5. Start vLLM (bare metal)
sudo systemctl start vllm-embed
sudo systemctl start vllm-dense
sudo systemctl start vllm-scout

# 6. Verify
./scripts/health-check.sh
```

---

## Environment Configuration

### Required Environment Variables

```bash
# Database
POSTGRES_PASSWORD=...
NEO4J_PASSWORD=...
REDIS_PASSWORD=...

# Ingestion
GITHUB_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=...

# Keycloak
KEYCLOAK_ADMIN_PASSWORD=...
KEYCLOAK_CLIENT_SECRET=...

# AI
LLM_BASE_URL=http://localhost:8000/v1
EMBEDDING_MODEL=BAAI/bge-m3
```

### Profile-Based Deployment

```bash
# Development (CPU, no GPU)
docker compose --profile cpu-dev up

# Production (with GPU)
docker compose --profile gpu up

# With observability
docker compose --profile gpu --profile observability up
```

---

## Migration Management

| Database | Tool | Command |
|----------|------|---------|
| PostgreSQL | Flyway | `flyway migrate` |
| Neo4j | neo4j-migrations | `neo4j-migrations migrate` |
| NATS | Idempotent script | `./scripts/nats-init.sh` |

### Flyway Configuration

```properties
flyway.url=jdbc:postgresql://localhost:5432/substrate_graph
flyway.user=substrate_graph
flyway.password=${DB_PASSWORD}
flyway.locations=filesystem:./migrations/postgresql
flyway.baselineOnMigrate=true
```

---

## Backup and Recovery

### PostgreSQL

```bash
# Backup
pg_dump -h localhost -U substrate_graph substrate_graph > backup.sql

# Restore
psql -h localhost -U substrate_graph substrate_graph < backup.sql
```

### Neo4j

```bash
# Backup (enterprise feature)
neo4j-admin backup --from=localhost --backup-dir=/backups/neo4j

# Restore
neo4j-admin restore --from=/backups/neo4j --database=neo4j --force
```

### Redis

Redis uses AOF persistence. Backup the appendonly.aof file.

---

## Air-Gapped Deployment

### Bundle Contents

```
substrate-airgap-bundle/
├── images/
│   ├── substrate-gateway.tar
│   ├── substrate-ingestion.tar
│   ├── substrate-graph.tar
│   ├── substrate-frontend.tar
│   ├── neo4j.tar
│   ├── postgres.tar
│   └── ...
├── models/
│   ├── llama-4-scout-fp4.gguf
│   ├── dense-70b-fp8.gguf
│   └── ...
├── licenses/
│   └── public-key.pem
├── compose.yaml
├── install.sh
└── README.md
```

### Installation

```bash
# 1. Load images
docker load -i images/substrate-gateway.tar

# 2. Copy models
sudo mkdir -p /opt/substrate/models
sudo cp models/* /opt/substrate/models/

# 3. Install license
sudo cp licenses/public-key.pem /etc/substrate/

# 4. Run installer
sudo ./install.sh
```

### Offline License Validation

Licenses are Ed25519-signed JWT tokens containing plan tier and feature entitlements. Validation uses a pre-distributed public key with no outbound network call.

---

## Monitoring

### Health Endpoints

```bash
# Service health
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:8082/health

# Infrastructure health
curl http://localhost:3000/health
```

### Logs

```bash
# Service logs
docker logs -f substrate-gateway
docker logs -f substrate-graph

# All services
docker compose logs -f

# Infrastructure
docker logs -f local-neo4j
docker logs -f local-postgres
```

---

## Troubleshooting

### Common Issues

**Neo4j connection refused:**
```bash
# Check if Neo4j is healthy
docker exec local-neo4j cypher-shell -u neo4j -p $NEO4J_PASSWORD "RETURN 1"
```

**NATS stream not found:**
```bash
# Reinitialize streams
./scripts/nats-init.sh
```

**Graph empty after sync:**
```bash
# Check job status
curl http://localhost:8081/jobs

# Check NATS consumers
nats consumer list
```
