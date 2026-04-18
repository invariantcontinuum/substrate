# Vulture whitelist — intentional "unused" names with documented reasons.
# Run: `uv run vulture . --min-confidence 70 --exclude 'tests,migrations,.venv' <this>`

# Reason: `scratch_dir` is part of the SourceConnector protocol contract. The
# GitHub connector's current implementation creates a temp dir via tempfile
# instead of honoring scratch_dir, but future connectors (local filesystem,
# pre-staged bundles) will use it. Keeping the parameter preserves the
# interface so add-connector PRs don't need protocol edits.
scratch_dir
