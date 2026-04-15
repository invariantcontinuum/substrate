# Substrate Platform Documentation

## Structural Integrity Platform for Software Teams

**Substrate** is a self-hosted governance workbench where software teams connect their code repositories, visualize architecture as a live graph, and query it through natural language.

---

## What is Substrate?

Modern software teams struggle with two invisible problems:

1. **Structural Drift** — The widening gap between architectural intent and production reality
2. **Memory Loss** — The silent erosion of why the system was built the way it was

Substrate ingests source code from connected repositories, parses static dependencies, generates embeddings, and builds a unified knowledge graph that stays synchronized with your actual codebase.

---

## Current Capabilities

| Capability | What It Means Today |
|------------|---------------------|
| **Live Graph** | Interactive Cytoscape visualization of code dependencies across one or more repository snapshots |
| **Source Connectors** | GitHub repository ingestion with automatic file discovery, import parsing, and dependency extraction |
| **Semantic Search** | Vector similarity search over file and chunk embeddings using local models |
| **LLM Summaries** | On-demand natural language summaries of any file in the graph |
| **Sync Scheduling** | Automatic periodic re-sync with configurable intervals |
| **Multi-Snapshot Merge** | Load and compare multiple sync snapshots simultaneously with divergence detection |

---

## Quick Navigation

<div class="grid cards" markdown>

-   :material-hexagon-multiple:{ .lg .middle } __Architecture__

    ---

    System architecture, data models, and deployment patterns

    [:octicons-arrow-right-24: Architecture Overview](architecture/index.md)

-   :material-cogs:{ .lg .middle } __System Design__

    ---

    Detailed design of each service and component

    [:octicons-arrow-right-24: System Design](system-design/index.md)

-   :material-code-braces:{ .lg .middle } __Developer Guide__

    ---

    API reference, environment variables, and frontend component docs

    [:octicons-arrow-right-24: Developer Guide](developer-guide/index.md)

-   :material-presentation:{ .lg .middle } __Product Pitch__

    ---

    Investor questions, revenue streams, and competitive landscape

    [:octicons-arrow-right-24: Product Pitch](product-pitch/index.md)

</div>

---

## Technology Highlights

- **Fully Self-Hosted**: All AI inference runs locally via lazy-lamacpp — zero data leaves your infrastructure
- **PostgreSQL + Apache AGE**: Single database for relational data, embeddings (pgvector), and graph queries (Cypher)
- **No Mock Data**: Every node, edge, and embedding comes from real repository analysis
- **Fast Sync Cycle**: Shallow clone → parse → embed → persist, typically completing in seconds to minutes depending on repo size

---

## Getting Started

See the [Architecture Overview](architecture/index.md) to understand the system, or dive into [System Design](system-design/index.md) for detailed service documentation.
