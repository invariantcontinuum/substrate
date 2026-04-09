import { useCallback } from "react";
import { useAuth } from "react-oidc-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useGraphStore } from "@/stores/graph";

interface JobRun {
  id: string;
  job_type: string;
  scope: Record<string, unknown>;
  status: string;
  progress_done: number;
  progress_total: number;
  error: string | null;
  created_at: string;
}

interface Schedule {
  id: number;
  job_type: string;
  owner: string;
  repo: string;
  interval_minutes: number;
  enabled: boolean;
  scope: Record<string, unknown>;
  last_run: string | null;
  next_run: string | null;
}

export function useJobs() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const queryClient = useQueryClient();
  const setSyncStatus = useGraphStore((s) => s.setSyncStatus);

  const jobsQuery = useQuery<JobRun[]>({
    queryKey: ["jobs"],
    queryFn: () => apiFetch<JobRun[]>("/jobs", token),
    enabled: !!token,
    refetchInterval: 5000,
  });

  const schedulesQuery = useQuery<Schedule[]>({
    queryKey: ["schedules"],
    queryFn: () => apiFetch<Schedule[]>("/jobs/schedules", token),
    enabled: !!token,
    refetchInterval: 30000,
  });

  const runJob = useMutation({
    mutationFn: async ({ jobType, scope }: { jobType: string; scope: Record<string, unknown> }) => {
      if (jobType === "sync") setSyncStatus("syncing");
      return apiFetch("/jobs", token, {
        method: "POST",
        body: JSON.stringify({ job_type: jobType, scope }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
    onError: () => setSyncStatus("error"),
  });

  const createSchedule = useCallback(
    async (jobType: string, repoUrl: string, intervalMinutes: number, scope: Record<string, unknown> = {}) => {
      await apiFetch("/jobs/schedules", token, {
        method: "POST",
        body: JSON.stringify({ job_type: jobType, repo_url: repoUrl, interval_minutes: intervalMinutes, scope }),
      });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    [token, queryClient]
  );

  const toggleSchedule = useCallback(
    async (id: number) => {
      await apiFetch(`/jobs/schedules/${id}/toggle`, token, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    [token, queryClient]
  );

  const deleteSchedule = useCallback(
    async (id: number) => {
      await apiFetch(`/jobs/schedules/${id}`, token, { method: "DELETE" });
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
    jobs: jobsQuery.data ?? [],
    schedules: schedulesQuery.data ?? [],
    runJob: runJob.mutate,
    isRunning: runJob.isPending,
    createSchedule,
    toggleSchedule,
    deleteSchedule,
    purgeGraph,
  };
}
