import { useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useGraphStore } from "@/stores/graph";

interface Schedule {
  id: number;
  owner: string;
  repo: string;
  interval_minutes: number;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
}

export function useSync() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const queryClient = useQueryClient();
  const setSyncStatus = useGraphStore((s) => s.setSyncStatus);

  const schedulesQuery = useQuery<Schedule[]>({
    queryKey: ["schedules"],
    queryFn: () => apiFetch<Schedule[]>("/ingest/schedules", token),
    enabled: !!token,
    refetchInterval: 30000,
  });

  const syncMutation = useMutation({
    mutationFn: async (repoUrl: string) => {
      setSyncStatus("syncing");
      return apiFetch("/ingest/github/sync", token, {
        method: "POST",
        body: JSON.stringify({ repo_url: repoUrl }),
      });
    },
    onSuccess: () => {
      // Sync started — status will update via WebSocket progress events
    },
    onError: () => {
      setSyncStatus("error");
    },
  });

  const setSchedule = useCallback(
    async (repoUrl: string, intervalMinutes: number) => {
      await apiFetch("/ingest/schedules", token, {
        method: "POST",
        body: JSON.stringify({ repo_url: repoUrl, interval_minutes: intervalMinutes }),
      });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    [token, queryClient]
  );

  const toggleSchedule = useCallback(
    async (id: number) => {
      await apiFetch(`/ingest/schedules/${id}/toggle`, token, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    [token, queryClient]
  );

  const purgeGraph = useCallback(
    async () => {
      await apiFetch("/api/graph", token, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["graph"] });
    },
    [token, queryClient]
  );

  return {
    schedules: schedulesQuery.data ?? [],
    triggerSync: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
    setSchedule,
    toggleSchedule,
    purgeGraph,
  };
}
