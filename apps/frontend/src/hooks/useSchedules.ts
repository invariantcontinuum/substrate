// frontend/src/hooks/useSchedules.ts
import { useAuth } from "react-oidc-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Schedule {
  id: number;
  source_id: string;
  interval_minutes: number;
  config_overrides: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}

export function useSchedules() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["schedules"],
    queryFn: () => apiFetch<Schedule[]>("/api/schedules", token),
    enabled: !!token,
    // Mutations invalidate via onSuccess; navigation triggers a refetch.
    // If a background scheduler changes state externally, the user can
    // refresh — schedules are low-frequency by nature.
  });

  const create = useMutation({
    mutationFn: (req: { source_id: string; interval_minutes: number }) =>
      apiFetch<Schedule>("/api/schedules", token, {
        method: "POST",
        body: JSON.stringify({ ...req, config_overrides: {} }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  const toggle = useMutation({
    mutationFn: (s: Schedule) =>
      apiFetch(`/api/schedules/${s.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !s.enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/schedules/${id}`, token, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  return {
    schedules: list.data ?? [],
    createSchedule: create.mutateAsync,
    toggleSchedule: toggle.mutateAsync,
    deleteSchedule: remove.mutateAsync,
  };
}
