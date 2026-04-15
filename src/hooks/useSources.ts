// frontend/src/hooks/useSources.ts
import { useAuth } from "react-oidc-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Source {
  id: string;
  source_type: string;
  owner: string;
  name: string;
  url: string;
  default_branch: string;
  config: Record<string, unknown>;
  last_sync_id: string | null;
  last_synced_at: string | null;
}

export function useSources() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiFetch<{ items: Source[] }>("/api/sources?limit=100", token),
    enabled: !!token,
  });

  const create = useMutation({
    mutationFn: (req: { source_type: string; owner: string; name: string; url: string }) =>
      apiFetch<{ id: string }>("/api/sources", token, {
        method: "POST",
        body: JSON.stringify({ ...req, config: {} }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  const purgeSource = useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch(`/api/sources/${sourceId}`, token, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sources"] });
      qc.invalidateQueries({ queryKey: ["syncs"] });
    },
  });

  return {
    sources: list.data?.items ?? [],
    createSource: create.mutateAsync,
    purgeSource: purgeSource.mutateAsync,
  };
}
