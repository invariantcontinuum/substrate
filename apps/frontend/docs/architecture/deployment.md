# Deployment

Substrate is designed for **self-hosted first** deployment with support for development and production environments.

---

## Deployment Modes

### Development Mode
- Single machine (laptop or workstation)
- Docker Compose with application services
- Local AI via `lazy-lamacpp` (on-demand model serving)
- Infrastructure (PostgreSQL, Keycloak) provided by `home-stack`

### Production Mode
- Docker Compose on dedicated server
- Persistent volumes for PostgreSQL
- Local or remote AI inference endpoints

---

## Docker Compose Structure

```yaml
# compose.yaml - Application Services
name: substrate-platform

# All services communicate with each other and with the home-stack infra
# (Keycloak, Postgres, Redis) exclusively via host.docker.internal on the
# host's published ports. No shared docker bridge network is used.

x-host-aliases: &host-aliases
  extra_hosts:
    - "host.docker.internal:host-gateway"

services:
  gateway:
    build: ./services/gateway
    container_name: substrate-gateway
    ports: ["8180:8080"]
    environment:
      KEYCLOAK_URL: http://host.docker.internal:8080
      KEYCLOAK_REALM: ${KEYCLOAK_REALM:-substrate}
      KEYCLOAK_ISSUER: https://auth.invariantcontinuum.io/realms/substrate
      GRAPH_SERVICE_URL: http://host.docker.internal:8182
      INGESTION_SERVICE_URL: http://host.docker.internal:8181
      REDIS_URL: redis://host.docker.internal:6379
    <<: *host-aliases
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"]
      interval: 10s
      timeout: 5s
      retries: 3

  ingestion:
    build: ./services/ingestion
    container_name: substrate-ingestion
    ports: ["8181:8081"]
    environment:
      FLYWAY_URL: jdbc:postgresql://host.docker.internal:5432/substrate_ingestion
      FLYWAY_USER: substrate_ingestion
      FLYWAY_PASSWORD: ${INGESTION_DB_PASSWORD}
      DATABASE_URL: postgresql+asyncpg://substrate_ingestion:${INGESTION_DB_PASSWORD}@host.docker.internal:5432/substrate_ingestion
      GRAPH_DATABASE_URL: postgresql+asyncpg://substrate_graph:${GRAPH_DB_PASSWORD}@host.docker.internal:5432/substrate_graph
      EMBEDDING_URL: http://host.docker.internal:8101/v1/embeddings
      GITHUB_TOKEN: ${GITHUB_TOKEN}
      APP_PORT: "8081"
    <<: *host-aliases
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  graph-service:
    build: ./services/graph
    container_name: substrate-graph
    ports: ["8182:8082"]
    environment:
      FLYWAY_URL: jdbc:postgresql://host.docker.internal:5432/substrate_graph
      FLYWAY_USER: substrate_graph
      FLYWAY_PASSWORD: ${GRAPH_DB_PASSWORD}
      DATABASE_URL: postgresql+asyncpg://substrate_graph:${GRAPH_DB_PASSWORD}@host.docker.internal:5432/substrate_graph
      EMBEDDING_URL: http://host.docker.internal:8101/v1/embeddings
      DENSE_LLM_URL: http://host.docker.internal:8102/v1/chat/completions
      APP_PORT: "8082"
    <<: *host-aliases
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8082/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  frontend:
    build:
      context: ./frontend
      args:
        GITHUB_TOKEN: ${GITHUB_TOKEN}
    container_name: substrate-frontend
    ports: ["3000:3000"]
    <<: *host-aliases
    networks: [local-infra-network]
    restart: unless-stopped

networks:
  local-infra-network:
    external: true
```

### Frontend Dockerfile Notes

The frontend image is a multi-stage build:
1. **Node stage**: Builds the React app with Vite (authenticates to GitHub Packages via `GITHUB_TOKEN` build arg)
2. **Python/MkDocs stage**: Builds the documentation site from `frontend/docs/`
3. **Nginx stage**: Serves the React app at `/` and documentation at `/docs`

If MkDocs fails during the build, a placeholder HTML page is used so the image still assembles successfully.

---

## Infrastructure Requirements

### Minimum (Development)

| Resource | Specification |
|----------|---------------|
| CPU | 8 cores |
| RAM | 16 GB |
| Storage | 50 GB SSD |
| GPU | Optional |

### Recommended (Production)

| Resource | Specification |
|----------|---------------|
| CPU | 16+ cores |
| RAM | 32+ GB |
| Storage | 200 GB NVMe SSD |
| GPU | Optional (speeds up embeddings/summaries) |

---

## Startup Sequence

```bash
# 1. Start infrastructure (home-stack)
cd ~/Desktop/home-stack
docker compose up -d

# 2. Wait for PostgreSQL and Keycloak to be healthy
# (home-stack includes health checks)

# 3. Start required LLM models
cd ~/Desktop/substrate/ops/llm/lazy-lamacpp
make start MODEL=embeddings
make start MODEL=dense

# 4. Start Substrate services
cd ~/Desktop/substrate
docker compose up -d

# 5. Verify
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:8082/health
```

---

## Environment Configuration

### Required Environment Variables

```bash
# Gateway
KEYCLOAK_URL=http://local-keycloak:8080
KEYCLOAK_REALM=substrate
GRAPH_SERVICE_URL=http://substrate-graph:8082
INGESTION_SERVICE_URL=http://substrate-ingestion:8081

# Ingestion
DATABASE_URL=postgresql+asyncpg://substrate_ingestion:changeme@local-postgres:5432/substrate_ingestion
GRAPH_DATABASE_URL=postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph
GITHUB_TOKEN=ghp_...
EMBEDDING_URL=http://localhost:8101/v1/embeddings

# Graph Service
DATABASE_URL=postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph
EMBEDDING_URL=http://localhost:8101/v1/embeddings
DENSE_LLM_URL=http://localhost:8102/v1/chat/completions

# Frontend
VITE_KEYCLOAK_URL=https://auth.invariantcontinuum.io
VITE_KEYCLOAK_REALM=substrate
VITE_KEYCLOAK_CLIENT_ID=substrate-frontend
```

---

## Migration Management

| Database | Tool | Location |
|----------|------|----------|
| PostgreSQL | SQL migrations | `services/graph/migrations/`<br>`services/ingestion/migrations/` |

Migrations are applied automatically on service startup or manually via the service-specific migration scripts.

---

## Backup and Recovery

### PostgreSQL

```bash
# Backup the graph database
pg_dump -h localhost -U substrate_graph substrate_graph > substrate_graph_backup.sql

# Backup the ingestion database
pg_dump -h localhost -U substrate_ingestion substrate_ingestion > substrate_ingestion_backup.sql

# Restore
psql -h localhost -U substrate_graph substrate_graph < substrate_graph_backup.sql
```

---

## Monitoring

### Health Endpoints

```bash
# Service health
curl http://localhost:8080/health
curl http://localhost:8081/health
curl http://localhost:8082/health
```

### Logs

```bash
# Service logs
docker logs -f substrate-gateway
docker logs -f substrate-graph
docker logs -f substrate-ingestion

# All services
docker compose logs -f
```

---

## Troubleshooting

### PostgreSQL connection refused

```bash
# Check if PostgreSQL is healthy
docker exec local-postgres pg_isready -U postgres
```

### Graph empty after sync

```bash
# Check sync status
curl http://localhost:8081/api/syncs

# Check for sync issues
curl http://localhost:8082/api/syncs/{sync_id}/issues
```

### Embeddings failing

```bash
# Verify embedding server is running
curl http://localhost:8101/health

# Or check lazy-lamacpp status
cd ~/Desktop/substrate/ops/llm/lazy-lamacpp && make status MODEL=embeddings
```
