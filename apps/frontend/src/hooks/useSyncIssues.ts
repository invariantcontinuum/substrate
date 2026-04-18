import { useAuth } from "react-oidc-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface SyncIssue {
  id: number;
  level: "info" | "warning" | "error";
  phase: string;
  code: string | null;
  message: string;
  context: Record<string, unknown>;
  occurred_at: string;
}

export function useSyncIssues(syncId: string | null, enabled: boolean) {
  const auth = useAuth();
  const token = auth.user?.access_token;

  const q = useQuery<SyncIssue[]>({
    queryKey: ["sync-issues", syncId],
    enabled: enabled && !!token && !!syncId,
    queryFn: () => apiFetch<SyncIssue[]>(`/api/syncs/${syncId}/issues`, token),
    staleTime: 30_000,
  });

  return { issues: q.data ?? [], isLoading: q.isLoading, refetch: q.refetch };
}
