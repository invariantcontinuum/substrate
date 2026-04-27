import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import {
  useChatContextStore,
  type ActiveChatContext,
} from "@/stores/chatContext";

interface ActiveResponse {
  active: ActiveChatContext | null;
}

const QK = ["chat-context", "active"] as const;

/**
 * Read the user's seed from the server and mirror it into the Zustand
 * store so the budget pill, ChatPlaceholder, and ChatContextSummaryPill
 * can subscribe to live updates without an additional fetch.
 */
export function useChatContext() {
  const token = useAuthToken();
  const setActive = useChatContextStore((s) => s.setActive);
  return useQuery<ActiveResponse>({
    queryKey: QK,
    enabled: !!token,
    queryFn: async () => {
      const data = await apiFetch<ActiveResponse>(
        "/api/chat-context/active",
        token,
      );
      setActive(data.active ?? null);
      return data;
    },
  });
}

/**
 * PUT a new seed (or null to clear). Writes through to both the React
 * Query cache and the persisted Zustand store so consumers that read
 * the active selection directly (without subscribing to the query)
 * see the change immediately.
 */
export function useApplyChatContext() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: ActiveChatContext | null) =>
      apiFetch<ActiveResponse>("/api/chat-context/active", token, {
        method: "PUT",
        body: next === null ? "null" : JSON.stringify(next),
      }),
    onSuccess: (data) => {
      qc.setQueryData(QK, data);
      useChatContextStore.getState().setActive(data.active ?? null);
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}
