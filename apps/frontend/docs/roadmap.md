# Roadmap & Future Vision

Substrate is an evolving platform. This document tracks the planned features and architectural expansions that are not yet implemented in the current stable release.

---

## Core Expansion (Sub-projects)

### [P2.6] Sub-project A — Generic Source Abstraction
**Status:** In Design (85% Foundation Ready)
Unlocks every non-GitHub source type by generalizing the SourceConnector protocol.
- Add 2nd connector (GitLab or Web URL)
- Generalize `parse_repo_url`
- Push GitHub-specific columns (owner, name) into polymorphic `sources.config` JSONB.

### [P2.7] Sub-project E — Scale (100k+ Nodes)
**Status:** In Research (~35% Ready)
Optimizing the engine for massive enterprise graphs.
- **HNSW Vector Index:** Migration to `pgvector USING hnsw` for faster similarity search.
- **Viewport-Aware API:** Bounding-box queries + cursor pagination for the graph service.
- **Server-Side Layout Caching:** Precomputing and caching node positions per sync snapshot.
- **Search Unification:** Layering `pg_trgm` keyword search with vector similarity and graph traversal.
- **LOD Rendering:** Level-of-Detail and edge bundling for the client when N > 10,000.

---

## New Capability Surfaces (DSG)

### DSG-006 — Policy Engine
**Status:** Proposed
Integration with Open Policy Agent (OPA) to enforce architectural constraints.
- Monaco Rego editor for rule authoring.
- GitHub Checks integration for CI/CD enforcement.
- Real-time violation badges on the graph.

### DSG-007 — ADR/WHY Layer
**Status:** Proposed
Capturing the "Why" behind architectural decisions.
- ADR explorer with embedding-based similarity.
- Incident graph explorer with causal chain tracing via recursive CTEs.

---

## The "Intended" Graph (Vision)

The long-term goal of Substrate is to reconcile the **Observed Graph (G_R)** (what exists in code) with the **Intended Graph (G_I)** (what should exist).

| Component | Target Source | Status |
|-----------|---------------|--------|
| **Policies** | Rego rules | Planned |
| **ADRs** | Markdown/Git | Planned |
| **Infrastructure** | Terraform/CloudFormation | Planned |
| **Runtime** | Kubernetes API | Planned |
| **Code Reality** | GitHub/GitLab | **Implemented** |

---

## Near-Term Polish (P1)

- **Retention Cron:** Scheduled pruning of old `sync_runs`.
- **"Currently Rendered" Panel:** Dedicated UI for active `sync_ids`.
- **Unified Toolbar Resync:** Promoting `retrySync` to the main toolbar.
- **Source Configuration:** Per-source config dialogs.
