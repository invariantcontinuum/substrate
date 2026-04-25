import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";

export type ThreadContextFile = {
  file_id: string;
  path: string;
  language: string | null;
  total_tokens: number;
  included: boolean;
};

export type ThreadContextTotals = {
  file_count: number;
  included_token_total: number;
  all_token_total: number;
};

export type ThreadContextResponse = {
  files: ThreadContextFile[];
  totals: ThreadContextTotals;
};

const qk = (threadId: string) =>
  ["chat-context", "thread", threadId, "files"] as const;

export function useThreadContextFiles(threadId: string | null) {
  const auth = useAuth();
  const token = auth?.user?.access_token;
  return useQuery<ThreadContextResponse>({
    queryKey: qk(threadId ?? ""),
    enabled: !!threadId && !!token,
    queryFn: () =>
      apiFetch(
        `/api/chat-context/threads/${threadId}/context-files`,
        token,
      ),
  });
}

export function usePatchThreadContextFiles(threadId: string) {
  const auth = useAuth();
  const token = auth?.user?.access_token;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Array<{ file_id: string; included: boolean }>) =>
      apiFetch<ThreadContextResponse>(
        `/api/chat-context/threads/${threadId}/context-files`,
        token,
        { method: "PATCH", body: JSON.stringify({ updates }) },
      ),
    onSuccess: (data) => {
      qc.setQueryData(qk(threadId), data);
    },
  });
}
