import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface Usage {
  sources: number;
  snapshots: number;
  embedding_bytes: number;
  graph_bytes: number;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

export function useUsage(): Usage | null {
  const [data, setData] = useState<Usage | null>(null);
  useEffect(() => {
    const tok = authToken();
    if (!tok) return;
    let cancelled = false;
    apiFetch<Usage>("/api/users/me/usage", tok)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { /* billing placeholder: swallow fetch failures */ });
    return () => { cancelled = true; };
  }, []);
  return data;
}
