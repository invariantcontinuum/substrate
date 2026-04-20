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
cd frontend/docs

# Install dependencies
pip install mkdocs mkdocs-material mkdocs-minify-plugin

# Start development server
mkdocs serve
```

The documentation will be available at `http://localhost:8000`

### Build

```bash
# Build static site
mkdocs build

# Build to specific directory
mkdocs build --site-dir ../../site
```

## Deployment

### Automatic Deployment

Documentation is automatically deployed to GitHub Pages when:
- Changes are pushed to `main` branch
- Changes affect files in `frontend/docs/` or `.github/workflows/deploy-docs.yml`

### Manual Deployment

```bash
# Build and deploy to GitHub Pages
mkdocs gh-deploy
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
