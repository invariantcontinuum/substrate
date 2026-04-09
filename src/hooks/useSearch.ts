import { useCallback, useState } from "react";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";

interface SearchResult {
  node_id: string;
  score: number;
  description: string;
  category: string;
  language: string;
  domain: string;
  name: string;
}

export function useSearch() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(
    async (query: string, type?: string, domain?: string) => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: query });
        if (type) params.set("type", type);
        if (domain) params.set("domain", domain);
        const data = await apiFetch<{ results: SearchResult[] }>(`/api/graph/search?${params}`, token);
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [token]
  );

  const clearResults = useCallback(() => setResults([]), []);

  return { results, searching, search, clearResults };
}
