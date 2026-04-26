import { useAuthedQuery } from "@/hooks/useAuthedQuery";

/**
 * One hit returned by GET /api/graph/search.
 *
 * ``community_index`` is -1 when the user has no active-set Leiden
 * result yet (or the matched node didn't land in any cluster). The
 * frontend routes those hits to the "Other" carousel slide.
 */
export interface SearchHit {
  node_id: string;
  filepath: string;
  name: string;
  type: string;
  community_index: number;
}

interface SearchResponse {
  hits: SearchHit[];
}

/**
 * Substring autocomplete over file rows the calling user owns. The
 * trimmed query is what we send and what we cache on. An empty query
 * disables the request — the modal's Ctrl+K open state is fine, the
 * dropdown just stays empty until the user types something.
 */
export function useSearch(query: string) {
  const trimmed = query.trim();
  const path = `/api/graph/search?q=${encodeURIComponent(trimmed)}`;
  return useAuthedQuery<SearchResponse>(
    ["graph", "search", trimmed],
    path,
    {
      enabled: trimmed.length > 0,
      staleTime: 10_000,
    },
  );
}
