import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import type { Entry, ThreadContext } from "@/types/chat";

const key = (threadId: string) => ["thread-entries", threadId] as const;

export function useThreadEntries(threadId: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: key(threadId ?? ""),
    enabled: !!threadId && !!token,
    queryFn: () =>
      apiFetch<ThreadContext>(`/api/chat/threads/${threadId}/entries`, token),
  });
}

export function useApplyThreadEntries(threadId: string) {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: Entry[]) =>
      apiFetch<ThreadContext>(`/api/chat/threads/${threadId}/entries`, token, {
        method: "PUT",
        body: JSON.stringify({ entries }),
      }),
    onSuccess: data => qc.setQueryData(key(threadId), data),
  });
}
