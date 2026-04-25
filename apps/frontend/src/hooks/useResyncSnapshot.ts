import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";
import type { ResumeCursor } from "@/hooks/useSyncs";

export interface ResyncResponse {
  id: string;
  parent_sync_id: string;
  source_id: string;
  status:
    | "pending"
    | "running"
    | "failed"
    | "completed"
    | "cancelled"
    | "cleaned";
  resume_cursor: ResumeCursor | null;
  started_at: string | null;
}

export function useResyncSnapshot() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (failedSyncId: string) =>
      apiFetch<ResyncResponse>(
        `/api/syncs/${failedSyncId}/resync`,
        token,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["syncs"] });
      qc.invalidateQueries({ queryKey: ["all-syncs"] });
    },
  });
}
