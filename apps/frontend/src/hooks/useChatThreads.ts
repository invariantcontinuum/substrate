import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "./useAuthToken";

export interface ChatThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
}

/**
 * Lists chat threads for the current user. The endpoint returns
 * `{items: ChatThread[]}`; we unwrap to the array so consumers don't
 * have to. Uses `useAuthedQuery`-style boilerplate inline because the
 * unwrap requires a custom queryFn (helper assumes the response IS the
 * data shape, which is fine for the other hooks).
 */
export function useChatThreads() {
  const token = useAuthToken();
  return useQuery({
    queryKey: ["chat", "threads"],
    queryFn: async () => {
      const data = await apiFetch<{ items: ChatThread[] }>("/api/chat/threads", token);
      return data.items;
    },
    enabled: !!token,
    staleTime: 10_000,
  });
}
