# API Reference

All API requests go through the **Gateway** at `http://localhost:8080`. Authentication is required for all protected routes via `Authorization: Bearer <JWT>`.

---

## Interactive Documentation

For a live, interactive reference of all endpoints, including request/response schemas and the ability to test calls directly, visit the built-in documentation provided by the services:

*   **REST API (Swagger):** [http://localhost:8080/docs](http://localhost:8080/docs)
*   **REST API (Redoc):** [http://localhost:8080/redoc](http://localhost:8080/redoc)

> **Note:** These links assume you are running the platform locally with the Gateway mapped to port 8080.

---

## Gateway

### Health Check

```http
GET /health
```

**Response:**
```json
{ "status": "ok" }
```

---

## Sources

Base path: `GET|POST|PATCH|DELETE /api/sources`

### List Sources

```http
GET /api/sources?cursor=<cursor>&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "source_type": "github_repo",
      "owner": "invariantcontinuum",
      "name": "substrate-platform",
      "url": "https://github.com/invariantcontinuum/substrate-platform",
      "default_branch": "main",
      "config": {},
      "last_sync_id": "...",
      "last_synced_at": "2026-04-12T10:30:00Z",
      "meta": {},
      "created_at": "...",
      "updated_at": "..."
    }
  ],
  "next_cursor": "..."
}
```

### Create Source

```http
POST /api/sources
Authorization: Bearer <token>
Content-Type: application/json

{
  "source_type": "github_repo",
  "owner": "invariantcontinuum",
  "name": "substrate-platform",
  "url": "https://github.com/invariantcontinuum/substrate-platform",
  "default_branch": "main"
}
```

**Notes:**
- Upserts on conflict of `(source_type, owner, name)`
- Returns the created/updated source

### Update Source Config

```http
PATCH /api/sources/{source_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "config": { "include_paths": ["src/"] }
}
```

### Delete Source

```http
DELETE /api/sources/{source_id}
Authorization: Bearer <token>
```

---

## Graph

Base path: `GET /api/graph`

### Get Merged Graph

```http
GET /api/graph?sync_ids=uuid1,uuid2
Authorization: Bearer <token>
```

**Response:**
```json
{
  "nodes": [
    {
      "data": {
        "id": "src_550e...:src/main.py",
        "name": "main.py",
        "type": "source",
        "domain": "",
        "source_id": "550e...",
        "file_path": "src/main.py",
        "loaded_sync_ids": ["uuid1"],
        "latest_sync_id": "uuid1",
        "divergent": false
      }
    }
  ],
  "edges": [
    {
      "data": {
        "source": "src_550e...:src/main.py",
        "target": "src_550e...:src/lib.py",
        "weight": 1.0,
        "weight_max": 1.0,
        "loaded_sync_ids": ["uuid1"]
      }
    }
  ],
  "meta": {
    "node_count": 150,
    "edge_count": 300,
    "sync_count": 1,
    "query_ms": 45
  }
}
```

### Get Node Detail

```http
GET /api/graph/nodes/src_{source_id}:{file_path}?sync_id={sync_id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "node": {
    "id": "src_550e...:src/main.py",
    "name": "main.py",
    "type": "source",
    "language": "python",
    "size_bytes": 2048,
    "line_count": 80,
    "description": "Entry point...",
    "imports_count": 5,
    "content_hash": "abc123..."
  },
  "neighbors": [
    {
      "node_id": "src_550e...:src/lib.py",
      "name": "lib.py",
      "rel_type": "depends_on",
      "weight": 1.0,
      "direction": "out"
    }
  ]
}
```

### Get Node Summary

```http
GET /api/graph/nodes/src_{source_id}:{file_path}/summary?sync_id={sync_id}&force=false
Authorization: Bearer <token>
```

**Response:**
```json
{
  "summary": "This module provides the main entry point...",
  "source": "llm",
  "sync_id": "uuid1"
}
```

**Notes:**
- If `force=false` and a cached summary exists in `file_embeddings.description`, it is returned immediately
- If no chunks exist, returns `{"source": "no_content"}`

### Get Graph Stats

```http
GET /api/graph/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "nodes": {
    "source": 120,
    "test": 30,
    "config": 10
  },
  "edges": 300
}
```

### Search Graph

```http
GET /api/graph/search?q=authentication+service&type=source&limit=10
Authorization: Bearer <token>
```

**Response:**
```json
{
  "results": [
    {
      "id": "src_550e...:src/auth.py",
      "name": "auth.py",
      "type": "source",
      "language": "python",
      "description": "Authentication utilities",
      "distance": 0.23
    }
  ]
}
```

---

## Syncs

Base path: `GET /api/syncs` (reads via Graph Service, writes via Ingestion through Gateway routing)

### List Syncs

```http
GET /api/syncs?source_id={source_id}&status=running&cursor={cursor}&limit=20
Authorization: Bearer <token>
```

### Get Sync

```http
GET /api/syncs/{sync_id}
Authorization: Bearer <token>
```

### Get Sync Issues

```http
GET /api/syncs/{sync_id}/issues?level=error&phase=parsing
Authorization: Bearer <token>
```

### Create Sync

```http
POST /api/syncs
Authorization: Bearer <token>
Content-Type: application/json

{
  "source_id": "550e8400-e29b-41d4-a716-446655440000",
  "triggered_by": "user"
}
```

### Cancel Sync

```http
POST /api/syncs/{sync_id}/cancel
Authorization: Bearer <token>
```

### Retry Sync

```http
POST /api/syncs/{sync_id}/retry
Authorization: Bearer <token>
```

### Clean Sync

```http
POST /api/syncs/{sync_id}/clean
Authorization: Bearer <token>
```

**Note:** Marks a completed/failed sync as `cleaned` and removes its graph data.

### Purge Sync

```http
DELETE /api/syncs/{sync_id}
Authorization: Bearer <token>
```

**Note:** Permanently deletes the sync run and all associated data.

---

## Schedules

Base path: `GET|POST|DELETE /api/schedules`

### List Schedules

```http
GET /api/schedules?source_id={source_id}
Authorization: Bearer <token>
```

### Create Schedule

```http
POST /api/schedules
Authorization: Bearer <token>
Content-Type: application/json

{
  "source_id": "550e8400-e29b-41d4-a716-446655440000",
  "interval_minutes": 60,
  "config_overrides": {}
}
```

### Update Schedule

```http
PATCH /api/schedules/{schedule_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": false
}
```

**Note:** The frontend's "toggle" action sends a `PATCH` with `{ enabled: !current_enabled }`.

### Delete Schedule

```http
DELETE /api/schedules/{schedule_id}
Authorization: Bearer <token>
```

---

## Auth Proxy

The Gateway proxies all `/auth/*` requests directly to Keycloak without JWT validation.

```http
GET /auth/realms/substrate/.well-known/openid-configuration
```

This enables the frontend OIDC library to discover endpoints and complete the auth flow.

---

## WebSocket

```
ws://localhost:8080/ws/graph?token=<JWT>
```

The Gateway validates the `token` query parameter and proxies the WebSocket connection to the Graph Service.

---

## Error Responses

All errors follow a consistent JSON structure:

```json
{
  "detail": "Error message here"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request — invalid parameters |
| 401 | Unauthorized — missing or invalid JWT |
| 404 | Not found — resource does not exist |
| 409 | Conflict — e.g., active sync already exists for source |
| 502 | Bad gateway — upstream disconnect |
| 503 | Service unavailable — upstream connect error |
| 504 | Gateway timeout — upstream timeout |
