# Adding a new language plugin to `substrate-graph-builder`

SP-2 established a plugin registry in `packages/substrate-graph-builder/`. To add support for a new language:

1. **Verify the grammar ships in `tree-sitter-language-pack`:**

   ```bash
   uv run --with tree-sitter-language-pack python -c \
     "from tree_sitter_language_pack import get_parser; get_parser('<lang>'); print('ok')"
   ```

   If the grammar is missing you'll either need to pin a standalone `tree-sitter-<lang>` wheel as a second dep of substrate-graph-builder or pick a different grammar.

2. **Create `packages/substrate-graph-builder/src/substrate_graph_builder/plugins/<lang>.py`.** Subclass `TreeSitterPlugin`:

   - Set `language`, `grammar_name`, `extensions` (and `filenames` if the language has special file names like `CMakeLists.txt`).
   - Fill `imports_query` with tree-sitter captures named `@import.<something>` — the base class harvests anything prefixed `import.`.
   - Fill `symbols_query` with `@symbol.function` / `@symbol.class` / `@symbol.method` captures.
   - Override `resolve(source_path, analysis, known_files, ctx) -> list[EdgeAffected]` using whatever `RepoContext` fields your language needs. If your language requires a new pre-scan (e.g., a project-file map), extend `RepoContext` + `_scan.py` to populate the new field once per repo walk.

3. **Register in `plugins/__init__.py`.** Add one `from ... import <Lang>Plugin` line and one `<Lang>Plugin(),` entry in the `REGISTRY` list. Keep the list alphabetical for grep friendliness.

4. **Unit test — `tests/test_<lang>_unit.py`.** Cover: parse + resolve happy path, unresolvable import (returns `[]`, no raise), one symbol of each kind the language supports. Pattern: instantiate the plugin, call `parse()` + `resolve()` on handcrafted snippets.

5. **Golden fixture — `tests/fixtures/<lang>/` with a tiny repo + `expected.json`.** Keep the fixture small (≤ 5 source files). The `expected.json` lists `node_ids` + `edges` (each edge is `{source_id, target_id, type}`). Line numbers in symbol node ids (`file#name@N`) must match the fixture file layout exactly.

6. **Fixture test — `tests/test_<lang>_fixture.py`.** One function using the `load_fixture` fixture; asserts the output of `build_graph` against the committed `expected.json`. Mirror an existing plugin's fixture test file for the template.

7. **Run the new suite:**

   ```bash
   uv run pytest packages/substrate-graph-builder/tests/test_<lang>_unit.py packages/substrate-graph-builder/tests/test_<lang>_fixture.py -v
   uv run ruff check packages/substrate-graph-builder/
   uv run mypy packages/substrate-graph-builder/src
   ```

   All green before commit.

8. **Update `tests/test_symbols_contract.py`:** add a canned snippet for the new language under `CANNED` and a new entry in `test_registry_has_expected_languages`'s expected set. This contract test fails loudly if a plugin lands without a working `symbols_query`.

9. **Update the subsystem entry** at `/home/dany/github/docs/invariant/subsystems/2026-04-18-substrate-graph-builder.md` (local-only doc) — bump the plugin count, note any known limitations per the "Known limitations" paragraph.

10. **Commit + push:** `feat(graph-builder): <lang> plugin (...)`. Single-line Conventional Commits per CLAUDE.md. Push immediately.

That's the whole recipe. No entry_points, no optional extras, no dynamic discovery — add code, add tests, commit.
