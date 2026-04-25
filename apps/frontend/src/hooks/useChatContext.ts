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
      qc.setQueryData(QK, data);
    },
  });
}
