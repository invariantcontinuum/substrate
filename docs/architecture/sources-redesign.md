# Sources page redesign

## Routes

- `/sources` — list of sources
- `/sources/snapshots` — global virtualized snapshot list
- `/sources/config` — Leiden knobs + Recompute + preview
- `/sources/activity` — unified feed of sync + leiden events

## Snapshot row (V3)

Collapsed card shows status chip, timestamp, duration, 4 stat pills
(nodes, edges, communities, modularity), and a community-size sparkline.
Expanded drawer has 6 sections: Counts & breakdown, Communities,
Storage, Timing, Delta vs previous, Issues.

## Activity feed

Backed by `GET /api/activity`, which UNION-ALLs `sync_runs` and
`leiden_cache` events for the user. Cursor-paginated by timestamp.

## Config tab

Drives `stores/carousel.stagedConfig`. Recompute bypasses the Postgres
cache and writes a fresh row under a new `cache_key`. Drift is computed
client-side by comparing staged vs active. Knobs and defaults mirror
`user_preferences.prefs.leiden`.
