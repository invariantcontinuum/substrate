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
  enabled: boolean;
  last_sync_id: string | null;
  last_synced_at: string | null;
}

export function useSources() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();

  // Sources rarely change between user actions (they only change when a
  // user creates/purges one — both already invalidate this query below).
  // Letting react-query's default refetchOnWindowFocus:true fire here
  // produces a brand-new `items` array on every tab/devtools toggle,
  // which cascades into GraphCanvas: sourceLabelMap rebuilds →
  // elementsWithParents rebuilds → cy.elements().remove(); cy.add(...);
  // cy.layout().run(). For a 100k-node graph that's ~30-60s of blank
  // canvas every time the user clicks back to the tab. Pin staleTime
  // and disable focus refetch so the only refresh paths are explicit
  // mutations (createSource, purgeSource).
  const list = useQuery({
    queryKey: ["sources"],
    queryFn: () => apiFetch<{ items: Source[] }>("/api/sources?limit=100", token),
    enabled: !!token,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
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

  const updateSource = useMutation({
    mutationFn: async (args: {
      id: string;
      label?: string;
      enabled?: boolean;
      config?: {
        retention?: {
          age_days?: number;
          per_source_cap?: number;
          never_prune?: boolean;
        };
      };
    }) => {
      const { id, ...body } = args;
      return apiFetch(`/api/sources/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  return {
    sources: list.data?.items ?? [],
    createSource: create.mutateAsync,
    purgeSource: purgeSource.mutateAsync,
    updateSource: updateSource.mutateAsync,
  };
}
