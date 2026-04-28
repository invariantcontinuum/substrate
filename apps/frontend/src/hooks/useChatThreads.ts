import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "./useAuthToken";

export interface ChatThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
  archived_at: string | null;
}

/**
 * Lists ALL chat threads (active + archived) for the current user by
 * issuing two requests and merging them. The active list (`archived=false`,
 * the default) and the archived list (`archived=true`) are fetched in
 * parallel so the sidebar can render both groups from a single hook.
 */
export function useChatThreads() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ["chat", "threads"],
    queryFn: async () => {
      const [active, archived] = await Promise.all([
        apiFetch<{ items: ChatThread[] }>("/api/chat/threads", token),
        apiFetch<{ items: ChatThread[] }>("/api/chat/threads?archived=true", token),
      ]);
      return [...active.items, ...archived.items];
    },
    enabled: !!token,
    staleTime: 10_000,
  });
}
