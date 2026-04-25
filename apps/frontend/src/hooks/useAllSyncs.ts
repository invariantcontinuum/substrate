import { useAuth } from "react-oidc-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { SyncRun } from "./useSyncs";

export function useAllSyncs() {
  const auth = useAuth();
  const token = auth.user?.access_token;

  const query = useQuery<{ items: SyncRun[] }>({
    queryKey: ["syncs", "all"],
    queryFn: () => apiFetch("/api/syncs?limit=100", token),
    enabled: !!token,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  return {
    syncs: query.data?.items ?? [],
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
