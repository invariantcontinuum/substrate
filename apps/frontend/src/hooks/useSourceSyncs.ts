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
      if (pageParam) params.set("cursor", pageParam as string);
      return apiFetch<SyncsPage>(`/api/syncs?${params.toString()}`, token);
    },
    getNextPageParam: (last) => last.next_cursor,
    // Poll every 5s while any snapshot in this source's list is
    // running or pending. Without this, progress_meta and stats
    // changes emitted by ingestion never reach the snapshot rows —
    // users see a stuck "Running 785 / 785" until they refresh the
    // page or defocus/refocus the window (react-query's default
    // refetchOnWindowFocus). The separate running-only poller in
    // useSyncs() updates its own cache entry (queryKey ["syncs",
    // "active"]) and doesn't share data with this per-source query.
    refetchInterval: (query) => {
      const items = (query.state.data?.pages ?? []).flatMap((p) => p.items);
      const hasActive = items.some(
        (r) => r.status === "running" || r.status === "pending",
      );
      return hasActive ? 5_000 : false;
    },
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
