# Troubleshooting Guide

This guide helps resolve common issues encountered when deploying, syncing, or querying the Substrate platform.

---

## Sync Failures

### 1. "Sync Already Active" (409 Conflict)
**Symptom:** Attempting to start a sync returns an error or a notice that a sync is already running.
**Reason:** Substrate enforces a strict "One Active Sync Per Source" rule at the database level to prevent graph corruption.
**Solution:** Wait for the current sync to complete, or use `POST /api/syncs/{id}/cancel` to stop it before retrying.

### 2. GitHub Authentication (401/403)
**Symptom:** Ingestion logs show `ConnectError` or `HTTPStatusError` during cloning.
**Reason:** The `GITHUB_PAT` is missing, expired, or doesn't have permissions for the target repository.
**Solution:** Verify your `.env` contains a valid `GITHUB_PAT` with `repo` scope.

### 3. NATS Payload Limit (Large Syncs)
**Symptom:** Sync completes, but the graph doesn't update in real-time on the dashboard.
**Reason:** For very large repositories (e.g., `curl/curl`), the graph delta JSON may exceed the NATS `max_payload` limit (default 1MB).
**Solution:** Refresh the page to trigger a full REST-based fetch of the graph. We are currently working on delta-chunking to resolve this (see [Roadmap](../roadmap.md)).

---

## Graph Visual Issues

### 1. "Canvas Cleared" / No Nodes
**Symptom:** The graph area is empty even after a successful sync.
**Reason:** No sync snapshots are currently selected.
**Solution:** Open the **Sources** modal and ensure at least one snapshot checkbox is checked.

### 2. Database Connection Timeouts
**Symptom:** Graph query logs show `asyncpg.exceptions.QueryCanceledError` or AGE query hangs.
**Reason:** Heavy Cypher queries on large graphs can exceed the default PostgreSQL `statement_timeout`.
**Solution:** Check the `GRAPH_DB_URL` and ensure the database has sufficient resources. We are implementing hard caps on query complexity (Sub-project E).

---

## API & Connectivity

### 1. Gateway 502 Bad Gateway
**Symptom:** All requests fail with 502.
**Reason:** The Gateway is running but cannot connect to the downstream `graph-service` or `ingestion-service`.
**Solution:** Check `docker compose ps` to ensure all services are `Up`. Verify they are on the same `infra-network`.

### 2. JWT Validation Failures
**Symptom:** UI shows "Unauthorized" or 401 even after logging into Keycloak.
**Reason:** Gateway cannot reach Keycloak to fetch the JWKS, or there is a clock-skew between containers.
**Solution:** Ensure `local-keycloak` is healthy. Sync your system clock and restart the containers.
