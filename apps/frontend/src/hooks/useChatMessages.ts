import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "./useAuthToken";

export interface Citation {
  node_id: string;
  name: string;
  type: string;
  /** Relational file_path (e.g. ``src/foo/bar.py``). Empty when the backend
   *  couldn't JOIN the node to file_embeddings. */
  file_path?: string;
  /** First content chunk, truncated to ~1200 chars on the server. Shown
   *  as an expandable code block under the citation chip. */
  excerpt?: string;
  /** Language hint for the expanded code block. */
  language?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
  /** When set, this message was superseded by another (edit/regenerate). */
  superseded_by?: string | null;
  /** When set, this message replaces an older one (edit only). */
  supersedes?: string | null;
}

export function useChatMessages(threadId: string | null) {
  const token = useAuthToken();
  return useQuery({
    queryKey: ["chat", "messages", threadId],
    queryFn: async () => {
      const data = await apiFetch<{ items: ChatMessage[] }>(
        `/api/chat/threads/${threadId}/messages`,
        token,
      );
      return data.items;
    },
    enabled: !!token && !!threadId,
    staleTime: 5_000,
  });
}
