import { useQuery } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";

export interface Citation {
  node_id: string;
  name: string;
  type: string;
}

export interface AskMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
}

export function useAskMessages(threadId: string | null) {
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useQuery({
    queryKey: ["ask", "messages", threadId],
    queryFn: async () => {
      const data = await apiFetch<{ items: AskMessage[] }>(
        `/api/ask/threads/${threadId}/messages`,
        token,
      );
      return data.items;
    },
    enabled: !!token && !!threadId,
    staleTime: 5_000,
  });
}
