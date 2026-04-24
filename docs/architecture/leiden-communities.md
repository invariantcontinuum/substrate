# Leiden community detection

Community detection runs in two complementary contexts. Both use
graspologic's `hierarchical_leiden`; parameter choice and caller differ.

## Per-sync Leiden (ingestion)

Runs once at sync completion, with fixed defaults, and writes
`sync_runs.stats.leiden`. Settings: `services/ingestion/src/config.py` →
`per_sync_leiden_*`. Tunable by a deploy's `.env`; not exposed per-user.

Stable across reads — changing defaults does NOT retroactively rewrite
historical `sync_runs` rows. To backfill after a knob change, run
`services/ingestion/scripts/backfill_stats.py`.

## Active-set Leiden (graph service)

Runs on demand over the union of the user's active sync set. Cached in
`leiden_cache` keyed by
`sha256(sorted_sync_ids | "::" | json(config, sort_keys))`. User-tunable
via `/api/users/me/preferences`.

Defaults live in `services/graph/src/config.py` (`active_set_leiden_*`
and `leiden_cache_*`) and mirror into `.env.local.example` / `.env.prod.example`.

## Cache key canonicalization

`LeidenConfig.canonical_hash(sync_ids)` sorts sync_ids lexicographically,
dumps the config as sort-keyed JSON, and SHA-256s the concatenation.

- Identical logical inputs always produce the same key across restarts.
- Request-time config merges over `user_preferences.prefs.leiden` before
  hashing, so "knob omitted" and "knob explicitly set to user-default"
  produce identical keys.

## Invalidation

Three orthogonal signals protect cache freshness:

| Signal                   | Mechanism                                                                                | Settings                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| Sync lifecycle terminal  | LISTEN on `substrate_sse`, filter `type=sync_lifecycle` + `status ∈ {completed, cleaned, failed}`, call `invalidate_for_sync_ids([sync_id])` | — (always on)                             |
| TTL sweep                | Background task, runs on startup and every `leiden_cache_sweep_interval_s`, bounded `DELETE … LIMIT 500` | `LEIDEN_CACHE_TTL_HOURS`, `LEIDEN_CACHE_SWEEP_INTERVAL_S` |
| Per-user LRU             | `evict_lru_for_user` trims older rows past the cap after each write                      | `LEIDEN_CACHE_MAX_ROWS_PER_USER`          |

## HTTP API

All endpoints require `X-User-Sub` (gateway-injected after JWT verification).

| Method + path                                                  | Description                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/communities?sync_ids=…&config=…`                     | Summary + capped per-community samples. `config` is a JSON-encoded LeidenConfig partial; merges over user defaults. |
| `POST /api/communities/recompute` `{sync_ids, config?}`        | Force recompute on the same key, bypassing cache.             |
| `GET /api/communities/assignments?cache_key=…`                 | NDJSON stream of `{node_id, community_index}` pairs.          |
| `GET /api/communities/{cache_key}/{index}/nodes?limit=&cursor=`| Paginated node ids for one community (lexicographic order).   |

## SSE progress events

On cache-MISS, `community.get_or_compute` publishes four
`type=leiden.compute` events via `SseBus` in phase order:

1. `building_graph`
2. `running_leiden`
3. `labeling`
4. `writing_cache`

Each event carries `payload = {cache_key, phase, sync_ids}` and the first
sync_id is pinned into `event.sync_id` so snapshot-row tiles filtering by
sync_id still see compute progress. Cache-HIT emits nothing.

Events travel on the canonical `/api/events` EventSource — no new channel,
no gateway changes. The frontend subscribes as `addEventListener("leiden.compute", …)`.

## Operational tuning

Every tunable is env-driven through the service's Pydantic settings; a
container restart applies changes. Relevant `.env` keys:

- `ACTIVE_SET_LEIDEN_ENABLED`
- `ACTIVE_SET_LEIDEN_TIMEOUT_S`
- `ACTIVE_SET_LEIDEN_LABELING_ENABLED`
- `ACTIVE_SET_LEIDEN_LABEL_MODEL`
- `LEIDEN_CACHE_TTL_HOURS`
- `LEIDEN_CACHE_SWEEP_INTERVAL_S`
- `LEIDEN_CACHE_MAX_ROWS_PER_USER`
- `LEIDEN_COMMUNITY_SAMPLE_SIZE`
- `PER_SYNC_LEIDEN_ENABLED` (ingestion)
- `PER_SYNC_LEIDEN_*` (ingestion defaults, see `.env.*.example`)
