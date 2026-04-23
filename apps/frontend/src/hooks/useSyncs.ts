// frontend/src/hooks/useSyncs.ts
import { useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import { useGraphStore } from "@/stores/graph";
import { useSyncSetStore, type SyncRunSummary } from "@/stores/syncSet";
import { openSseClient } from "substrate-web-common";

// Tagged outcome type for the startSync mutation.
// 409 sync_already_active is NOT an error — it returns `kind: "already_active"`.
export type CreateSyncOutcome =
  | { kind: "created"; sync_id: string }
  | { kind: "already_active"; sync_id: string };

async function postSyncMutation(
  url: string,
  body: Record<string, unknown>,
  token: string | undefined,
): Promise<CreateSyncOutcome> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (res.status === 202) {
    const data = await res.json() as { sync_id: string; status?: string };
    return { kind: "created", sync_id: data.sync_id };
  }
  if (res.status === 409) {
    const data = await res.json() as { error?: string; sync_id?: string };
    if (data?.error === "sync_already_active" && data.sync_id) {
      return { kind: "already_active", sync_id: data.sync_id };
    }
  }
  throw new Error(`Unexpected sync response: ${res.status}`);
}

export interface SyncRunStats {
  nodes?: number;
  edges?: number;
  symbols?: number;
  defines_edges?: number;
  files_embedded?: number;
  chunks?: number;
  chunks_embedded?: number;
  duration_ms?: number;
  denied_file_count?: number;
}

// Matches the `meta` dict populated by services/ingestion/src/jobs/sync.py
// as it walks through phases. Every field is optional because the
// ingestion writer assembles it incrementally and older rows may be
// missing later-added keys.
export interface SyncProgressMeta {
  phase?: string;
  source?: string;
  files_total?: number;
  files_parseable?: number;
  files_parsed?: number;
  files_embedded?: number;
  chunks_total?: number;
  chunks_embedded?: number;
  /** Populated once graph-writer has computed age_nodes / age_edges,
   * before embedding begins. Lets the stats panel surface live counts
   * instead of em-dashing until the final complete_sync_run fires. */
  nodes_total?: number;
  edges_total?: number;
  /** Set by the graph-builder pass before AGE writes start. `edges_found`
   * is the total depends-on edge count; `symbol_count` and
   * `defines_edges` land during the symbol+defines phases. */
  edges_found?: number;
  symbol_count?: number;
  defines_edges?: number;
  /** Count breakdown by ingestion's node type taxonomy
   * (source/doc/config/script/service/asset/data). */
  nodes_by_type?: Record<string, number>;
}

export interface SyncRun {
  id: string;
  source_id: string;
  status: string;
  ref: string | null;
  progress_done: number;
  progress_total: number;
  progress_meta: SyncProgressMeta | null;
  stats: SyncRunStats | null;
  schedule_id: number | null;
  triggered_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useSyncs() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();
  const setSyncStatus = useGraphStore((s) => s.setSyncStatus);

  const active = useQuery<{ items: SyncRun[] }>({
    queryKey: ["syncs", "active"],
    queryFn: () => apiFetch("/api/syncs?status=running&limit=50", token),
    enabled: !!token,
    // No polling — cache invalidations are driven by SSE below.
  });

  // Lifecycle → invalidate. Progress → patch cached rows in place.
  // Progress events fire dozens of times per sync (phase transitions +
  // per-batch inside parse/graph/embed loops); invalidating each one
  // triggered a /api/syncs refetch per event, which was the visible
  // slowness during sync. Lifecycle transitions stay rare enough that
  // a full refetch is cheaper than reasoning about status diffs.
  useEffect(() => {
    if (!token) return;
    const client = openSseClient("/api/events", { token });
    // Scope invalidations to the active-list query only. `useLoadedSyncs`
    // caches per-id rows under `["syncs", <id>]` with a 60s staleTime —
    // matching those with a prefix match would fire 1 + N parallel
    // GET /api/syncs/{id} per SSE event, enough to hit the browser's
    // 6-per-host concurrent-connection ceiling and surface as
    // net::ERR_INSUFFICIENT_RESOURCES on page refresh.
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ["syncs", "active"], exact: true });
    client.on("sync_lifecycle", (ev) => {
      invalidate();
      // When a sync completes, the graph-read side has fresh nodes/edges
      // and summaries. Drop any cached ["node-detail", ...] entries so
      // re-opening the detail panel refetches instead of showing stale
      // pre-sync data. `exact: false` matches all node-detail variants
      // (selectedNodeId + selectedSnapshotId permutations).
      if (ev.payload?.status === "completed") {
        qc.invalidateQueries({ queryKey: ["node-detail"] });
      }
    });
    client.on("sync_progress", (ev) => {
      const sid = ev.sync_id;
      if (!sid) return;
      const prev = qc.getQueryData<{ items: SyncRun[] }>(["syncs", "active"]);
      // If the sync isn't in cache yet — e.g. a just-triggered run whose
      // lifecycle "running" event hasn't refetched the list yet — fall back
      // to invalidation so the row appears. In-place patching only makes
      // sense for rows we already hold.
      if (!prev?.items.some((r) => r.id === sid)) {
        invalidate();
        return;
      }
      const p = ev.payload ?? {};
      qc.setQueryData<{ items: SyncRun[] }>(["syncs", "active"], (curr) => {
        if (!curr) return curr;
        let changed = false;
        const items = curr.items.map((r) => {
          if (r.id !== sid) return r;
          changed = true;
          return {
            ...r,
            progress_done: (p.progress_done as number | undefined) ?? r.progress_done,
            progress_total: (p.progress_total as number | undefined) ?? r.progress_total,
            progress_meta: (p.progress_meta as SyncProgressMeta | undefined) ?? r.progress_meta,
          };
        });
        return changed ? { ...curr, items } : curr;
      });
    });
    client.on("token_expired", () => client.close());
    client.on("stream_dropped", () => client.close());
    return () => client.close();
  }, [qc, token]);

  // Fix: also populate sourceMap for sync_ids in the active set that are
  // completed (not running), so onSyncCompleted can find same-source swaps.
  const activeSetIds = useSyncSetStore((s) => s.syncIds);
  const unknownIds = activeSetIds.filter(
    (id) => !useSyncSetStore.getState().sourceMap.has(id),
  );
  const lookups = useQuery<Record<string, string>>({
    queryKey: ["sync-source-lookup", [...unknownIds].sort().join(",")],
    enabled: !!token && unknownIds.length > 0,
    queryFn: async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        unknownIds.map(async (id) => {
          try {
            const row = await apiFetch<{ source_id: string }>(`/api/syncs/${id}`, token);
            out[id] = row.source_id;
          } catch {
            // Unknown id — pruneInvalid will handle it
          }
        }),
      );
      return out;
    },
  });

  const lastSeen = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const items = active.data?.items ?? [];
    // Build sourceMap from running syncs + any cached lookups for active-set members.
    const sm = new Map<string, string>(useSyncSetStore.getState().sourceMap);
    for (const run of items) sm.set(run.id, run.source_id);
    for (const [k, v] of Object.entries(lookups.data ?? {})) sm.set(k, v);
    useSyncSetStore.getState().registerSourceMap(sm);

    let needsActiveLookup = false;
    for (const run of items) {
      const prev = lastSeen.current.get(run.id);
      if (prev !== run.status) {
        lastSeen.current.set(run.id, run.status);
        if (prev === "running" && run.status === "completed") {
          needsActiveLookup = true;
          const sources = qc.getQueryData<{ items: { id: string; owner: string; name: string }[] }>(["sources"]);
          const src = (sources?.items ?? []).find((s) => s.id === run.source_id);
          const label = src ? `${src.owner}/${src.name}` : run.source_id;
          useSyncSetStore.getState().onSyncCompleted(
            { id: run.id, source_id: run.source_id, status: run.status } as SyncRunSummary,
            label,
          );
          setSyncStatus("idle");
        }
        if (prev === "running" && (run.status === "failed" || run.status === "cancelled")) {
          logger.warn("sync_terminal_non_success", { id: run.id, status: run.status });
          setSyncStatus("error");
        }
      }
    }
    if (needsActiveLookup) {
      qc.invalidateQueries({ queryKey: ["syncs", "active"], exact: true });
      qc.invalidateQueries({ queryKey: ["sources"] });
    }
  }, [active.data, lookups.data, qc, setSyncStatus]);

  const startSync = useMutation<CreateSyncOutcome, Error, { source_id: string }>({
    mutationFn: (req) =>
      postSyncMutation("/api/syncs", { ...req, config_overrides: {} }, token),
    onSuccess: (outcome) => {
      if (outcome.kind === "created") setSyncStatus("syncing");
      qc.invalidateQueries({ queryKey: ["syncs", "active"], exact: true });
    },
    onError: () => setSyncStatus("error"),
  });

  const cancelSync = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/syncs/${id}/cancel`, token, { method: "POST" }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["syncs", "active"], exact: true });
      // Just the affected per-id row — leave every other ["syncs", X]
      // cache entry alone.
      qc.invalidateQueries({ queryKey: ["syncs", id], exact: true });
    },
  });

  const cleanSync = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/syncs/${id}/clean`, token, { method: "POST" }),
    onSuccess: (_data, id) => {
      const remaining = useSyncSetStore.getState().syncIds.filter((x) => x !== id);
      useSyncSetStore.getState().pruneInvalid(new Set(remaining));
      qc.invalidateQueries({ queryKey: ["syncs", "active"], exact: true });
      qc.invalidateQueries({ queryKey: ["syncs", id], exact: true });
    },
  });

  const purgeSync = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/syncs/${id}`, token, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      const remaining = useSyncSetStore.getState().syncIds.filter((x) => x !== id);
      useSyncSetStore.getState().pruneInvalid(new Set(remaining));
      qc.invalidateQueries({ queryKey: ["syncs", "active"], exact: true });
      // The purged row no longer exists server-side — drop the cache entry
      // entirely rather than invalidating (which would re-fetch a 404).
      qc.removeQueries({ queryKey: ["syncs", id], exact: true });
    },
  });

  return {
    activeSyncs: active.data?.items ?? [],
    startSync: startSync.mutateAsync,
    cancelSync: cancelSync.mutateAsync,
    cleanSync: cleanSync.mutateAsync,
    purgeSync: purgeSync.mutateAsync,
  };
}
