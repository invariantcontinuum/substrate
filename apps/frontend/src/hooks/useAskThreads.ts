import { useQuery } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";

export interface AskThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
}

export function useAskThreads() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  return useQuery({
    queryKey: ["ask", "threads"],
    queryFn: async () => {
      const data = await apiFetch<{ items: AskThread[] }>("/api/ask/threads", token);
      return data.items;
    },
    enabled: !!token,
    staleTime: 10_000,
  });
}
