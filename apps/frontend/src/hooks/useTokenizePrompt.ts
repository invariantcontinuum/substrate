import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { Entry } from "@/types/chat";

type TokenizeResponse = {
  tokens:       number | null;
  prompt_chars: number;
  error:        string | null;
};

export function useTokenizePrompt(entries: Entry[], message: string) {
  const token = useAuthToken();
  const debounced = useDebouncedValue({ entries, message }, 400);
  return useQuery({
    queryKey: ["tokenize", debounced],
    enabled: !!token,
    queryFn: () =>
      apiFetch<TokenizeResponse>("/api/llm/dense/tokenize", token, {
        method: "POST",
        body: JSON.stringify(debounced),
      }),
    staleTime: 30_000,
  });
}
