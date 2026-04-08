import { useQuery } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";

export interface GraphSnapshot {
  nodes: Array<{ data: Record<string, unknown> }>;
  edges: Array<{ data: Record<string, unknown> }>;
  meta: { node_count: number; edge_count: number; last_updated?: string };
}

export function useGraphData() {
  const auth = useAuth();
  const token = auth.user?.access_token;

  return useQuery<GraphSnapshot>({
    queryKey: ["graph"],
    queryFn: () => apiFetch<GraphSnapshot>("/api/graph", token),
    enabled: !!token,
    refetchOnWindowFocus: false,
  });
}
