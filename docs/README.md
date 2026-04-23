# Substrate Platform Documentation

This directory contains the comprehensive documentation for the Substrate Platform, built with [MkDocs](https://www.mkdocs.org/) and the [Material theme](https://squidfunk.github.io/mkdocs-material/).

## Structure

```
docs/
├── index.md                    # Documentation homepage
├── architecture/               # Architecture documentation
│   ├── index.md
│   ├── overview.md
│   ├── data-model.md
│   ├── tech-stack.md
│   └── deployment.md
├── system-design/              # System design documentation
│   ├── index.md
│   ├── gateway.md
│   ├── ingestion.md
│   ├── graph-service.md
│   ├── frontend.md
│   ├── infrastructure.md
│   └── graph-edge-symbols.md
├── developer-guide/            # Developer reference
│   ├── index.md
│   ├── api-reference.md
│   ├── environment-variables.md
│   └── frontend-components.md
├── product-pitch/              # Product pitch materials
│   ├── index.md
│   ├── elevator-pitch.md
│   ├── investor-questions.md
│   ├── revenue-streams.md
│   └── competitive-landscape.md
├── product-market-fit/         # Product market fit documentation
│   ├── index.md
│   ├── unique-selling-points.md
│   ├── capability-matrix.md
│   └── pricing.md
├── problems-solved/            # Problem domain documentation
│   ├── index.md
│   ├── structural-drift.md
│   ├── institutional-memory.md
│   ├── ai-code-governance.md
│   └── governance-gaps.md
└── target-audience/            # Target audience personas
    ├── index.md
    ├── vp-engineering.md
    ├── staff-engineers.md
    ├── security-teams.md
    ├── devops-platform.md
    └── scrum-masters.md
```

## Local Development

### Prerequisites

- Python 3.8+
- pip

### Setup

```bash
# Navigate to docs directory
cd docs

# Install dependencies
pip install mkdocs mkdocs-material mkdocs-minify-plugin

# Start development server
mkdocs serve
```

The documentation will be available at `http://localhost:8000`

### Docker

```bash
# Build and run the standalone docs container
docker compose up -d --build docs
```

The container publishes the MkDocs site at `http://localhost:8190`

### Build

```bash
# Build static site
mkdocs build

# Build to specific directory
mkdocs build --site-dir ../../site
```

## Deployment

Substrate docs are not published via GitHub Pages. They are built into the `substrate-docs` container and published on host port `8190`, which `home-stack` proxies as `docs.invariantcontinuum.io`.

The repo also ships GitHub Actions workflows that interact with docs and delivery:

- `ci.yml` builds the docs site as part of the fast validation pipeline on `main` and `v*`.
- `publish-snapshot.yml` publishes the `substrate-docs` image to GHCR with the active `X.Y.Z-SNAPSHOT` version on `main`.
- `release.yml` builds a docs tarball, publishes the `substrate-docs:X.Y.Z` image, and attaches the bundle to the `vX.Y.Z` GitHub Release.
- `deploy-prod.yml` recreates the full prod stack, including `substrate-docs`, via `scripts/deploy-prod.sh`.

Manual docs verification remains:

```bash
mkdocs build -f docs/mkdocs.yml
```

## Writing Documentation

### Markdown Extensions

The documentation supports various Markdown extensions:

#### Admonitions

```markdown
!!! note "Note title"
    This is a note.

!!! warning "Warning"
    This is a warning.
```

#### Code Blocks

```markdown
```python
def hello():
    print("Hello, World!")
```
```

#### Tables

```markdown
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
```

#### Mermaid Diagrams

```markdown
```mermaid
graph LR
    A[Start] --> B[End]
```
```

### Style Guide

1. **Use clear, concise language**
2. **Include code examples** where applicable
3. **Add diagrams** for complex concepts
4. **Cross-reference** related sections
5. **Keep audience in mind** (technical vs. business)

## Configuration

The `mkdocs.yml` file contains:
- Site metadata (name, description, URL)
- Theme configuration (colors, features)
- Navigation structure
- Plugin settings
- Markdown extensions

## License

Copyright &copy; 2026 Invariant Continuum Technologies
