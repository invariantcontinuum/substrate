// frontend/src/hooks/useSyncs.ts
import { useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";
import { useGraphStore } from "@/stores/graph";
import { useSyncSetStore, type SyncRunSummary } from "@/stores/syncSet";

export interface SyncRun {
  id: string;
  source_id: string;
  status: string;
  ref: string | null;
  progress_done: number;
  progress_total: number;
  progress_meta: unknown;
  stats: unknown;
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
    refetchInterval: (q) => {
      const items = (q.state.data as { items?: SyncRun[] } | undefined)?.items ?? [];
      return items.length > 0 ? 5_000 : 30_000;
    },
  });

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
      qc.invalidateQueries({ queryKey: ["syncs"] });
      qc.invalidateQueries({ queryKey: ["sources"] });
    }
  }, [active.data, lookups.data, qc, setSyncStatus]);

  const startSync = useMutation({
    mutationFn: (req: { source_id: string }) =>
      apiFetch<{ id: string }>("/api/syncs", token, {
        method: "POST",
        body: JSON.stringify({ ...req, config_overrides: {} }),
      }),
    onSuccess: () => {
      setSyncStatus("syncing");
      qc.invalidateQueries({ queryKey: ["syncs"] });
    },
    onError: () => setSyncStatus("error"),
  });

  const cancelSync = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/syncs/${id}/cancel`, token, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["syncs"] }),
  });

  const retrySync = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/syncs/${id}/retry`, token, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["syncs"] }),
  });

  const cleanSync = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/syncs/${id}/clean`, token, { method: "POST" }),
    onSuccess: (_data, id) => {
      const remaining = useSyncSetStore.getState().syncIds.filter((x) => x !== id);
      useSyncSetStore.getState().pruneInvalid(new Set(remaining));
      qc.invalidateQueries({ queryKey: ["syncs"] });
    },
  });

  const purgeSync = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/syncs/${id}`, token, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      const remaining = useSyncSetStore.getState().syncIds.filter((x) => x !== id);
      useSyncSetStore.getState().pruneInvalid(new Set(remaining));
      qc.invalidateQueries({ queryKey: ["syncs"] });
    },
  });

  return {
    activeSyncs: active.data?.items ?? [],
    startSync: startSync.mutateAsync,
    cancelSync: cancelSync.mutateAsync,
    retrySync: retrySync.mutateAsync,
    cleanSync: cleanSync.mutateAsync,
    purgeSync: purgeSync.mutateAsync,
  };
}
