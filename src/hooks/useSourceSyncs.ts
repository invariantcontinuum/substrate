// frontend/src/hooks/useSourceSyncs.ts
import { useAuth } from "react-oidc-context";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { SyncRun } from "./useSyncs";

interface SyncsPage {
  items: SyncRun[];
  next_cursor: string | null;
  total: number | null;
}

export function useSourceSyncs(sourceId: string | null, status?: string) {
  const auth = useAuth();
  const token = auth.user?.access_token;

  const q = useInfiniteQuery<SyncsPage>({
    queryKey: ["syncs", "source", sourceId, status ?? "all"],
    enabled: !!token && !!sourceId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("source_id", sourceId as string);
      params.set("limit", "25");
      if (status) params.set("status", status);
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<SyncsPage>(`/api/syncs?${params.toString()}`, token);
    },
    getNextPageParam: (last) => last.next_cursor,
  });

  const items = (q.data?.pages ?? []).flatMap((p) => p.items);
  return {
    items,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    hasNextPage: q.hasNextPage,
    fetchNextPage: q.fetchNextPage,
    refetch: q.refetch,
  };
}
