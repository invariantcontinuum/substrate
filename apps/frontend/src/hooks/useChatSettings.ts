import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import type { ChatSettings } from "@/types/chat";

const KEY = ["chat-settings"];

export function useChatSettings() {
  const token = useAuthToken();
  return useQuery({
    queryKey: KEY,
    enabled: !!token,
    queryFn: () => apiFetch<ChatSettings>("/api/users/me/chat-settings", token),
  });
}

export function usePatchChatSettings() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChatSettings) =>
      apiFetch<ChatSettings>("/api/users/me/chat-settings", token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: data => qc.setQueryData(KEY, data),
  });
}

export function useDeleteAllThreads() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: number }>("/api/chat/threads/delete-all", token, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}

export function useArchiveAllThreads() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ archived: number }>("/api/chat/threads/archive-all", token, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}

export function useArchiveThread() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/chat/threads/${id}/archive`, token, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}

export function useUnarchiveThread() {
  const token = useAuthToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/chat/threads/${id}/unarchive`, token, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}
