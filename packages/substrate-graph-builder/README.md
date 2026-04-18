# substrate-graph-builder

Plugin registry that produces substrate graph documents (file + symbol nodes, `depends` + `defines` edges) from a materialized filesystem tree. Each language is a self-contained plugin under `substrate_graph_builder.plugins.<lang>`; grammars are supplied by [`tree-sitter-language-pack`](https://pypi.org/project/tree-sitter-language-pack/). See the spec at `/home/dany/github/docs/superpowers/specs/2026-04-18-sp2-graph-builder-design.md` for the full contract.

Consumed by `services/ingestion`. Not published to PyPI or GitHub Packages as of SP-2 (workspace-only dep); publishing is one `uv build && uv publish` away if external consumers emerge.
