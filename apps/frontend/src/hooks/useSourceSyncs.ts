// frontend/src/hooks/useSourceSyncs.ts
import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { SyncRun } from "./useSyncs";
import { openSseClient } from "substrate-web-common";

interface SyncsPage {
  items: SyncRun[];
  next_cursor: string | null;
  total: number | null;
}

export function useSourceSyncs(sourceId: string | null, status?: string) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();

  const queryKey = ["syncs", "source", sourceId, status ?? "all"];

  const q = useInfiniteQuery<SyncsPage>({
    queryKey,
    enabled: !!token && !!sourceId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("source_id", sourceId as string);
      params.set("limit", "25");
      if (status) params.set("status", status);
      if (pageParam) params.set("cursor", pageParam as string);
      return apiFetch<SyncsPage>(`/api/syncs?${params.toString()}`, token);
    },
    getNextPageParam: (last) => last.next_cursor,
    // No polling. SSE below invalidates on any sync_lifecycle or
    // sync_progress event for this source.
  });

  useEffect(() => {
    if (!token || !sourceId) return;
    const client = openSseClient("/api/events", { sourceId });
    const invalidate = () => qc.invalidateQueries({ queryKey });
    client.on("sync_lifecycle", invalidate);
    client.on("sync_progress", invalidate);
    client.on("source_changed", invalidate);
    client.on("token_expired", () => client.close());
    client.on("stream_dropped", () => client.close());
    return () => client.close();
  }, [qc, token, sourceId, queryKey]);

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
