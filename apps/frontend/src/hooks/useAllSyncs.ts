import type { SyncRun } from "./useSyncs";
import { useAuthedQuery } from "./useAuthedQuery";

export function useAllSyncs() {
  const query = useAuthedQuery<{ items: SyncRun[] }>(
    ["syncs", "all"],
    "/api/syncs?limit=100",
    { refetchOnWindowFocus: false, staleTime: 30_000 },
  );

  return {
    syncs: query.data?.items ?? [],
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
