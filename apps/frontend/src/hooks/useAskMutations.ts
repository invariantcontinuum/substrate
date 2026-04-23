import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";
import { useSyncSetStore } from "@/stores/syncSet";
import type { AskMessage } from "./useAskMessages";
import type { AskThread } from "./useAskThreads";

export function useCreateThread() {
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useMutation({
    mutationFn: async (title?: string) =>
      apiFetch<AskThread>("/api/ask/threads", token, {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ask", "threads"] }),
  });
}

export function useRenameThread() {
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) =>
      apiFetch<AskThread>(`/api/ask/threads/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ask", "threads"] }),
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<null>(`/api/ask/threads/${id}`, token, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ask", "threads"] }),
  });
}

export function useSendTurn(threadId: string | null) {
  const qc = useQueryClient();
  const auth = useAuth();
  const token = auth.user?.access_token;
  const syncIds = useSyncSetStore((s) => s.syncIds);
  return useMutation({
    mutationFn: async (content: string) => {
      if (!threadId) throw new Error("no active thread");
      return apiFetch<{ user_message: AskMessage; assistant_message: AskMessage }>(
        `/api/ask/threads/${threadId}/messages`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ content, sync_ids: syncIds }),
        },
      );
    },
    onSuccess: ({ user_message, assistant_message }) => {
      qc.setQueryData<AskMessage[]>(
        ["ask", "messages", threadId],
        (prev) => [...(prev ?? []), user_message, assistant_message],
      );
      qc.invalidateQueries({ queryKey: ["ask", "threads"] });
    },
  });
}
