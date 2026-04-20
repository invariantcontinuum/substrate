# Gateway Service

**Host port:** 8180 (debug) — browsers reach it through the frontend container's nginx proxy.
**Container port:** 8080
**Language:** Python 3.12 / FastAPI
**Repository:** `services/gateway/`

---

## Overview

The Gateway is the **single ingress point** for all API traffic after nginx. It's deliberately thin — it authenticates requests and proxies them to downstream services without transforming payloads. It also owns the **SSE fan-out** for server→client events.

No WebSocket proxy. No Redis. No ingress TLS termination (that's home-stack's NPM in prod).

---

## Responsibilities

1. **JWT authentication** — validate Bearer tokens via Keycloak JWKS (cached)
2. **Request routing** — HTTP proxy to Graph or Ingestion based on method + path
3. **SSE fan-out** — `GET /api/events` (EventSource) with `Last-Event-ID` replay, backed by Postgres `LISTEN/NOTIFY`
4. **CORS** — origins configured per `.env.<mode>`
5. **Resilience** — shared `httpx.AsyncClient`, app-level retries on idempotent methods

---

## Architecture

```mermaid
flowchart LR
    subgraph Edge["Frontend container: nginx"]
        NGX[/api, /auth, /ingest proxy]
    end

    subgraph Gateway["Gateway :8080 (host 8180 debug)"]
        AUTH[JWT validation]
        PROXY[HTTP proxy]
        SSE[SSE fan-out / replay]
    end

    subgraph Services
        ING[Ingestion :8081]
        GRAPH[Graph :8082]
        KC[Keycloak :8080]
    end

    subgraph DB
        PG[(sse_events + LISTEN/NOTIFY)]
    end

    NGX -->|HTTP| Gateway
    AUTH --> PROXY

    PROXY -->|/api/*| GRAPH
    PROXY -->|/api/syncs POST/DELETE + /api/schedules writes + /ingest/*| ING
    PROXY -->|/auth/*| KC

    SSE -->|replay + LISTEN| PG
    SSE -->|stream events| NGX
```

---

## Authentication flow

### JWT validation

1. Extract Bearer token from `Authorization` header (HTTP) or `?token=` query param (SSE only, per RFC 6750 §2.3 fallback)
2. Parse the unverified JWT header to get `kid`
3. Fetch JWKS from Keycloak (cached with 5-minute TTL, background refresh on stale cache)
4. Validate:
   - Signature (RS256)
   - Expiration (`exp`)
   - Issuer (`iss` — driven by `KEYCLOAK_ISSUER`)
   - **Audience not verified** (`verify_aud=False`)
5. If valid, proxy upstream

### SSE auth

Token passed as query parameter (browsers' `EventSource` can't set headers):

```
GET /api/events?token=<JWT>&Last-Event-ID=<N>
```

The gateway validates on upgrade, then streams.

---

## Routing

Read operations go to the graph service; sync/schedule *writes* go to ingestion.

| Route | Methods | Destination | Description |
|---|---|---|---|
| `GET /health` | GET | Gateway | Liveness |
| `/api/events` | GET | Gateway (SSE) | Server-sent events stream + replay |
| `/api/graph/*`, `/api/sources/*`, `/api/syncs`, `/api/schedules` | GET | Graph | All reads |
| `/api/sources/*` | POST / PATCH / DELETE | Graph | Source CRUD |
| `/api/syncs`, `/api/syncs/{id}/...` | POST / DELETE | Ingestion | Sync lifecycle commands |
| `/api/schedules`, `/api/schedules/{id}` | POST / PATCH / DELETE | Ingestion | Schedule commands |
| `/ingest/*` | ANY | Ingestion | Direct ingestion proxy |
| `/auth/*` | ANY | Keycloak | OIDC endpoints proxy (kept for convenience; browser can hit Keycloak directly too) |

No `/ws/*` route exists. The `make lint` banned-token gate fails the build if `WebSocket` / `/ws` appear in service code.

---

## SSE endpoint (`src/sse_endpoint.py`)

The SSE path has unique semantics that justify its own module:

- **Own Postgres pool** — small, dedicated to the SSE path so a stuck stream can't saturate the gateway's proxy pool.
- **Catch-up replay** — on connect, reads `SELECT … FROM sse_events WHERE id > $last_event_id` and emits each row as an SSE frame. After replay, the connection switches to live streaming.
- **Live streaming** — `LISTEN substrate_sse` on the dedicated connection; each `NOTIFY <id>` triggers a fetch of that row and a frame emission.
- **Last-Event-ID** — honored from the `Last-Event-ID` request header (set automatically by browsers on auto-reconnect) and from a `?last_event_id=` fallback query param.
- **Auth errors before stream starts** return normal HTTP 401; once the stream is open, an error is surfaced as an SSE `event: error` frame with `data: {"code":"token_expired"}` — the client refreshes and reconnects.

Writers (ingestion and graph) insert into `sse_events` and `pg_notify('substrate_sse', id::text)` in the same transaction.

---

## Key modules

### `config.py`

Pydantic `BaseSettings`:

| Variable | Default | Purpose |
|---|---|---|
| `KEYCLOAK_URL` | `http://keycloak:8080` | Keycloak internal DNS for JWKS fetch |
| `KEYCLOAK_REALM` | `substrate` | Realm name |
| `KEYCLOAK_ISSUER` | `""` | Browser-facing issuer; falls back to `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}` |
| `KC_GATEWAY_CLIENT_SECRET` | `""` | For service-account token exchange |
| `GRAPH_SERVICE_URL` | `http://graph:8082` | Graph upstream |
| `INGESTION_SERVICE_URL` | `http://ingestion:8081` | Ingestion upstream |
| `DATABASE_URL` | `postgresql+asyncpg://substrate_graph:...@postgres:5432/substrate_graph` | SSE pool only |
| `AUTH_DISABLED` | `false` | Dev-only bypass — leaves stub admin claims; **never enable in prod** |
| `CORS_ORIGINS` | `[]` | JSON list, populated from `.env.<mode>` |

No `REDIS_URL`. No `WebSocket` config.

### `auth.py`
- `validate_token(token, public_key, issuer)` — RS256 decode with `verify_aud=False`
- `JWKSClient` — JWKS fetcher with 5-minute TTL cache and stale-while-revalidate background refresh

### `proxy.py`
- `init_client()` / `close_client()` — lifecycle for a shared `httpx.AsyncClient`
- `proxy_request()` — forwards with app-level retries (3 attempts, exponential backoff) for idempotent methods on `ConnectError`

### `main.py`
FastAPI app factory with lifespan:
- Startup: initialize `JWKSClient`, proxy HTTP client, SSE DB pool
- Shutdown: close proxy client and SSE pool
- Mounts CORS middleware and the SSE router

---

## HTTP connection pooling

```python
limits = httpx.Limits(
    max_connections=100,
    max_keepalive_connections=20,
    keepalive_expiry=2.0
)
client = httpx.AsyncClient(limits=limits)
```

`keepalive_expiry=2.0s` is intentionally shorter than uvicorn's 5s idle timeout so we don't reuse a connection the upstream is about to close.

---

## Error handling

| Error | Response |
|---|---|
| Invalid JWT | `401 UNAUTHORIZED` |
| Expired JWT | `401 token_expired` |
| Upstream `ConnectError` | `503` |
| Upstream timeout | `504` |
| Persistent disconnect | `502` |

4xx responses log at `info` level; 5xx at `error` level (see `substrate-common.errors.register_handlers`).

---

## Deployment

```dockerfile
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml .
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev
COPY src/ src/
EXPOSE 8080
CMD ["uv", "run", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

In compose, the gateway runs on the `substrate_internal` bridge with DNS name `gateway`; host publishes `8180:8080` for debug.

---

## Observability

Structured JSON logs via `structlog`:
- `gateway_started` / `gateway_stopped` lifecycle
- `auth_failed` (warning)
- `upstream_error` (warning) on proxy failures
- `jwks_refreshed` when the cache reloads
- `sse_replay`, `sse_client_connected`, `sse_client_disconnected`

Per-request metrics (request count, latency, JWKS cache hit rate) are not currently emitted — a Prometheus exporter is planned.
