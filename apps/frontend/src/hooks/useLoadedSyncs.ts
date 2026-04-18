// frontend/src/hooks/useLoadedSyncs.ts
//
// Fetches individual sync run details for each sync ID in the loaded set.
// Designed for the CurrentlyRenderedRail — syncs in the active set may be
// completed (not returned by the running-only useSyncs poller), so we need
// per-ID lookups cached via react-query.

import { useAuth } from "react-oidc-context";
import { useQueries } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { SyncRun } from "./useSyncs";

export function useLoadedSyncs(syncIds: string[]): (SyncRun | null)[] {
  const auth = useAuth();
  const token = auth.user?.access_token;

  const results = useQueries({
    queries: syncIds.map((id) => ({
      queryKey: ["syncs", id],
      enabled: !!token,
      staleTime: 60_000,
      queryFn: () => apiFetch<SyncRun>(`/api/syncs/${id}`, token),
    })),
  });

  return results.map((r) => r.data ?? null);
}
