import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  useChatContextStore,
  type ActiveChatContext,
} from "@/stores/chatContext";

const QK = ["chat-context", "active"] as const;

export function useChatContext() {
  const auth = useAuth();
  const token = auth?.user?.access_token;
  const setActive = useChatContextStore((s) => s.setActive);
  const q = useQuery<{ active: ActiveChatContext | null }>({
    queryKey: QK,
    queryFn: () => apiFetch("/api/chat-context/active", token),
    enabled: !!token,
  });
  useEffect(() => {
    if (q.data) setActive(q.data.active);
  }, [q.data, setActive]);
  return q;
}

export function useApplyChatContext() {
  const auth = useAuth();
  const token = auth?.user?.access_token;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: ActiveChatContext | null) =>
      apiFetch<{ active: ActiveChatContext | null }>(
        "/api/chat-context/active",
        token,
        {
          method: "PUT",
          body: next === null ? "null" : JSON.stringify(next),
        },
      ),
    onSuccess: (data) => {
      // Write through to BOTH the React Query cache AND the persisted
      // Zustand store. The query cache hydrates components mounting via
      // ``useChatContext``; the store serves components that read the
      // active selection directly (ChatPlaceholder, ContextBudgetPill,
      // ChatContextSummaryPill) without subscribing to the query —
      // critical when the Settings modal closes and the chat page
      // re-mounts before the next query refresh would fire.
      qc.setQueryData(QK, data);
      useChatContextStore.getState().setActive(data.active);
      // Invalidate so any future consumer of `useChatContext()`
      // revalidates against the server (defence against optimistic vs
      // server drift if the backend canonicalises the payload).
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}
