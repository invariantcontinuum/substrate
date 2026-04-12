# Substrate Platform Documentation

## Structural Integrity Platform for Software Teams

**Substrate** is a self-hosted governance workbench where software teams manage the four things that matter most: live architecture visibility, active policy enforcement, institutional memory preservation, and intelligent querying through natural language.

---

## What is Substrate?

Modern software teams are losing two simultaneous battles:

1. **Structural Drift** — The widening gap between architectural intent and production reality
2. **Memory Loss** — The silent erosion of why the system was built the way it was

Substrate is an **active computable governance layer** that ingests everything a team produces — code, infrastructure configuration, project planning artifacts, and runtime signals — and builds a live unified knowledge graph from it.

---

## Core Capabilities

| Capability | What It Means |
|------------|---------------|
| **Live Graph** | A continuously updated graph of actual architecture, built from connected tool signals — not diagrams someone drew and forgot to update |
| **Policy Engine** | A Rego policy editor and enforcement log. Every block, every pass, with full traceability |
| **WHY Layer** | An ADR + incident graph explorer. WHY edges connecting decisions to their causes |
| **Intelligent Query** | Natural language in, graph-grounded answers out. Ask "why does this rule exist?" and receive sourced answers |

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

-   :material-presentation:{ .lg .middle } __Product Pitch__

    ---

    Investor questions, revenue streams, and competitive landscape

    [:octicons-arrow-right-24: Product Pitch](product-pitch/index.md)

-   :material-target:{ .lg .middle } __Target Audience__

    ---

    Who benefits from Substrate and how

    [:octicons-arrow-right-24: Target Audience](target-audience/index.md)

</div>

---

## The North Star

> A single engineering team can connect their tools, see their architecture as a live graph, understand why every structural rule exists, simulate proposed changes before writing code, and get blocked automatically when they are about to break the system.

---

## Technology Highlights

- **Fully Self-Hosted**: All AI inference runs locally — zero data leaves your infrastructure
- **WASM/WebGL Graph Engine**: Hardware-accelerated rendering of 20K+ node graphs at 60fps
- **Real-Time Updates**: WebSocket-delivered deltas from NATS event bus
- **Policy as Code**: OPA/Rego-based governance with deterministic enforcement
- **GraphRAG**: Hardened retrieval-augmented generation with HyDE, RAPTOR, and hybrid fusion

---

## Getting Started

See the [Architecture Overview](architecture/index.md) to understand the system, or dive into [System Design](system-design/index.md) for detailed service documentation.
