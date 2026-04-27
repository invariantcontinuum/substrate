import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";

// ── Selection types ────────────────────────────────────────────────
// Mode-based discriminated union mirroring the backend Pydantic
// SelectionUnion. The backend rejects cross-mode payloads with 422 so
// every UI tab MUST emit exactly one branch.

export type SelectionAll = { kind: "all" };
export type SelectionFiles = { kind: "files"; file_ids: string[] };
export type CommunityRef = { cache_key: string; community_index: number };
export type SelectionCommunities = {
  kind: "communities";
  communities: CommunityRef[];
};
export type SelectionDirectories = {
  kind: "directories";
  dir_prefixes: string[];
};
export type Selection =
  | SelectionAll
  | SelectionFiles
  | SelectionCommunities
  | SelectionDirectories;

export type ThreadContextFile = {
  file_id:    string;
  path:       string;
  language:   string | null;
  size_bytes: number | null;
};

export type ThreadContext = {
  scope:     { sync_ids: string[]; source_ids: string[] };
  selection: Selection;
};

interface ThreadContextResponse {
  context: ThreadContext;
  files:   ThreadContextFile[];
}

interface CommunitySummary {
  community_count: number;
  modularity:      number;
  largest_share:   number;
  orphan_pct:      number;
  community_sizes: number[];
}

interface CommunityListItem {
  index:           number;
  label:           string;
  size:            number;
  node_ids_sample: string[];
}

interface CommunityListResponse {
  cache_key:   string | null;
  summary?:    CommunitySummary;
  communities: CommunityListItem[];
}

const ctxQk = (threadId: string) =>
  ["thread-context", threadId] as const;
const commQk = (threadId: string) =>
  ["thread-communities", threadId] as const;

/**
 * Read the per-thread context (frozen scope + active selection) plus
 * the resolved file list for the All-files / Directories tabs of the
 * pill modal. Drives the budget-pill file count too.
 */
export function useThreadContext(threadId: string | null) {
  const token = useAuthToken();
  return useQuery<ThreadContextResponse>({
    queryKey: ctxQk(threadId ?? ""),
    enabled: !!token && !!threadId,
    queryFn: () =>
      apiFetch<ThreadContextResponse>(
        `/api/chat/threads/${threadId}/context`,
        token,
      ),
  });
}

/**
 * PUT a new mode-based selection. Invalidates the thread-context query
 * so the modal and budget pill pick up the change without a remount.
 */
export function useApplyThreadSelection(threadId: string | null) {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (selection: Selection) =>
      apiFetch<{ context: ThreadContext }>(
        `/api/chat/threads/${threadId}/context/selection`,
        token,
        { method: "PUT", body: JSON.stringify(selection) },
      ),
    onSuccess: () => {
      if (threadId) qc.invalidateQueries({ queryKey: ctxQk(threadId) });
    },
  });
}

/**
 * List the Leiden communities for the thread's frozen scope. Powers
 * the Communities tab of the pill modal — same shape as the canonical
 * `/api/communities?sync_ids=` route, but server-side scoped so the
 * UI doesn't have to mirror the scope on the wire.
 */
export function useThreadCommunities(threadId: string | null) {
  const token = useAuthToken();
  return useQuery<CommunityListResponse>({
    queryKey: commQk(threadId ?? ""),
    enabled: !!token && !!threadId,
    queryFn: () =>
      apiFetch<CommunityListResponse>(
        `/api/chat/threads/${threadId}/context/communities`,
        token,
      ),
  });
}
