# substrate

Substrate governance platform — monorepo.

## Quickstart

```bash
gh repo clone invariantcontinuum/substrate
cd substrate
make bootstrap
make llm-start MODEL=embeddings
make llm-start MODEL=dense
make up
# open http://localhost:3535
```

| URL | Service |
|---|---|
| http://localhost:3535 | Frontend |
| http://localhost:8080 | Keycloak |
| http://localhost:5050 | pgadmin |
| http://localhost:5432 | Postgres (optional) |
| http://localhost:8101 | Embeddings LLM |
| http://localhost:8102 | Dense LLM |

## Layout

- `apps/frontend` — React app
- `services/{gateway,ingestion,graph}` — FastAPI services
- `packages/{substrate-common,substrate-web-common,graph-ui}` — shared code
- `ops/{compose,infra,llm}` — docker compose, substrate-owned infra, local LLM runtime
- `scripts/` — bootstrap, doctor, import-history
- `env/` — env templates
- `docs/` — developer guide, architecture, target-audience (governance personas)

## Docs

See `docs/developer-guide/` for full setup.
