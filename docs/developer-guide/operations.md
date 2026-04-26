# Operations Guide

This guide covers post-deploy operational tasks for the Substrate platform.

---

## Re-sync to populate file descriptions

Files ingested before the MVP-finalize commit (V8 migration, 2026-04-26) have an
empty `file_embeddings.description` text column even though their embedding
vectors are populated. Chat retrieval (sparse keyword search via
`description_tsv`, plus chat-store reads of `f.description`) depends on the
description text being present, so older snapshots will return weaker matches
until they are re-synced.

The going-forward ingestion path now writes the preview description text
alongside the embedding vector. No retroactive backfill ships with this
change — operators re-sync each source once after upgrading to populate older
rows.

### From the UI

1. Navigate to **Sources**.
2. Select the source whose snapshots have empty descriptions.
3. Click **Re-sync now**.

### From the API

```bash
POST /api/sources/{id}/sync
```

The new sync run inherits the same `source_id`, writes a fresh row in
`file_embeddings` (one per file path) with `description` populated, and the
prior snapshot's rows remain queryable until they are pruned.

### Verification

Once the sync completes, confirm the description text is populated:

```bash
MODE=prod docker compose exec postgres psql -U substrate_graph -d substrate_graph \
  -c "SELECT file_path, length(description) FROM file_embeddings \
      WHERE sync_id = (SELECT id FROM sync_runs ORDER BY started_at DESC LIMIT 1) \
      LIMIT 5;"
```

Each row should show `length(description) > 0`.

### Note on the on-demand richer summary

The ingestion-side description is a deterministic preview (path, type,
language, and the first N lines of the file content). The graph service's
on-demand `enriched_summary` pipeline still upgrades a row's description to a
richer LLM-generated summary the first time the file is rendered in the UI; it
keys its cache on the `description_generated_at` column, which the ingestion
preview leaves NULL precisely so the upgrade can run on first view.
