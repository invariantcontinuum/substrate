import { useEffect, useMemo } from "react";
import { useAuth } from "react-oidc-context";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { SyncRun } from "./useSyncs";
import { openSseClient } from "@/lib/sse";

interface SyncsPage {
  items: SyncRun[];
  next_cursor: string | null;
  total: number | null;
}

export function useSourceSyncs(sourceId: string | null, status?: string) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const qc = useQueryClient();

  const queryKey = useMemo(
    () => ["syncs", "source", sourceId, status ?? "all"],
    [sourceId, status],
  );

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
    const client = openSseClient("/api/events", { sourceId, token });
    const invalidate = () => qc.invalidateQueries({ queryKey });
    // Lifecycle + source_changed → invalidate. Progress → patch cached
    // pages in place so the per-source list doesn't refetch on every
    // progress tick (was the main source of perceived sync slowness).
    client.on("sync_lifecycle", invalidate);
    client.on("source_changed", invalidate);
    client.on("sync_progress", (ev) => {
      const sid = ev.sync_id;
      if (!sid) return;
      const prev = qc.getQueryData<{ pages: SyncsPage[]; pageParams: unknown[] }>(queryKey);
      const existsInCache =
        prev?.pages.some((page) => page.items.some((r) => r.id === sid)) ?? false;
      // New sync that hasn't made it into any page yet → invalidate so the
      // row appears (same reasoning as useSyncs). Patching silently would
      // drop progress for syncs triggered moments ago.
      if (!existsInCache) {
        invalidate();
        return;
      }
      const p = ev.payload ?? {};
      qc.setQueryData<{ pages: SyncsPage[]; pageParams: unknown[] }>(
        queryKey,
        (curr) => {
          if (!curr) return curr;
          let anyChanged = false;
          const pages = curr.pages.map((page) => {
            let pageChanged = false;
            const items = page.items.map((r) => {
              if (r.id !== sid) return r;
              pageChanged = true;
              return {
                ...r,
                progress_done: (p.progress_done as number | undefined) ?? r.progress_done,
                progress_total: (p.progress_total as number | undefined) ?? r.progress_total,
                progress_meta: (p.progress_meta as SyncRun["progress_meta"]) ?? r.progress_meta,
              };
            });
            if (pageChanged) anyChanged = true;
            return pageChanged ? { ...page, items } : page;
          });
          return anyChanged ? { ...curr, pages } : curr;
        },
      );
    });
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
