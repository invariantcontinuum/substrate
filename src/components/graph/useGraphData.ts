import { useQuery } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";
import { SEED_SNAPSHOT } from "@/lib/seed-data";

export interface GraphSnapshot {
  nodes: Array<{ data: Record<string, unknown>; position?: { x: number; y: number } }>;
  edges: Array<{ data: Record<string, unknown> }>;
  meta: { node_count: number; edge_count: number; last_updated?: string };
}

function mapLabels(snapshot: GraphSnapshot): GraphSnapshot {
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        label: n.data.label || n.data.name || n.data.id,
      },
    })),
  };
}

export function useGraphData() {
  const auth = useAuth();
  const token = auth.user?.access_token;

  return useQuery<GraphSnapshot>({
    queryKey: ["graph"],
    queryFn: async () => {
      const raw = await apiFetch<GraphSnapshot>("/api/graph", token);
      const mapped = mapLabels(raw);
      if (mapped.nodes.length === 0) {
        return SEED_SNAPSHOT;
      }
      return mapped;
    },
    enabled: !!token,
    refetchOnWindowFocus: false,
  });
}
