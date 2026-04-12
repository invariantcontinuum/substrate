import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useGraphStore } from "@/stores/graph";

interface ProgressMeta {
  phase: string;
  repo: string;
  files_total: number;
  files_parseable: number;
  files_parsed: number;
  edges_found: number;
  nodes_by_type: Record<string, number>;
}

interface JobRun {
  id: string;
  job_type: string;
  scope: Record<string, unknown>;
  status: string;
  progress_done: number;
  progress_total: number;
  progress_meta: ProgressMeta | null;
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

  // Watch the polled jobs for running→completed transitions and trigger
  // a graph refetch when any job flips to completed. Without this, the
  // frontend would never refetch /api/graph after a sync that the user
  // triggered from the modal, because the runJob.mutate() onSuccess fires
  // at POST time (sync start), not when the job actually finishes.
  const lastSeenStatus = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const jobs = jobsQuery.data ?? [];
    let sawCompletion = false;
    for (const job of jobs) {
      const prev = lastSeenStatus.current.get(job.id);
      if (prev !== job.status) {
        lastSeenStatus.current.set(job.id, job.status);
        if (prev === "running" && job.status === "completed") {
          sawCompletion = true;
        }
      }
    }
    if (sawCompletion) {
      queryClient.invalidateQueries({ queryKey: ["graph"] });
      useGraphStore.getState().setCanvasCleared(false);
      setSyncStatus("idle");
    }
  }, [jobsQuery.data, queryClient, setSyncStatus]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["graph"] });
      useGraphStore.getState().setCanvasCleared(false);
    },
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
