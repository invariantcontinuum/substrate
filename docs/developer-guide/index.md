# Developer Guide

This section provides practical documentation for developers working on or extending the Substrate Platform.

---

## What's in This Guide

| Section | Purpose |
|---------|---------|
| [API Reference](api-reference.md) | Complete endpoint documentation for all services |
| [Environment Variables](environment-variables.md) | Configuration reference for every service |
| [Frontend Components](frontend-components.md) | Component inventory and usage patterns |
| [Migrations](migrations.md) | Database schema migrations and Flyway setup |

---

## Quick Links

- **Gateway** runs on port `8080`
- **Ingestion** runs on port `8081`
- **Graph Service** runs on port `8082`
- **Frontend** runs on port `3000`
- **PostgreSQL** runs on port `5432`
- **Keycloak** runs on port `8080`

---

## Development Workflow

1. Start infrastructure: `cd ~/github/danycrafts/home-stack && docker compose up -d`
2. Start LLM models: `cd ~/github/lazy-lamacpp && make start MODEL=embeddings && make start MODEL=dense`
3. Start Substrate services: `cd ~/github/invariantcontinuum/substrate-platform && docker compose up -d`
4. Start frontend dev server: `cd frontend && npm run dev`

---

## Coding Standards

- **Python**: Follow PEP 8, use type hints, prefer `async`/`await` for I/O
- **TypeScript**: Strict mode enabled, explicit return types on exported functions
- **No mock data**: All data must come from real services or databases
- **Conventional commits**: `feat(scope): description`, `fix(scope): description`, etc.
