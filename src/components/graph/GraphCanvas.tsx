import { useState, useEffect, useMemo } from "react";
import { Graph } from "@invariantcontinuum/graph/react";
import type {
  GraphSnapshot,
  LegendSummary,
  NodeData,
} from "@invariantcontinuum/graph/react";
import { useAuth } from "react-oidc-context";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import type { ModalName } from "@/stores/ui";
import { SignalsOverlay } from "./SignalsOverlay";
import { DynamicLegend } from "./DynamicLegend";
import { ViolationBadge } from "./ViolationBadge";

const EMPTY_SNAPSHOT: GraphSnapshot = {
  nodes: [],
  edges: [],
  meta: { node_count: 0, edge_count: 0 },
};
const DEFAULT_REPO_URL = "https://github.com/curl/curl.git";

// The graph service currently returns Cytoscape-style wrapped elements
// ({nodes:[{data:{id,...}}], edges:[{data:{id,source,target,...}}]}).
// The @invariantcontinuum/graph React component expects flat elements
// ({nodes:[{id,...}], edges:[{id,source,target,...}]}). Normalize here.
type RawElement = { data?: Record<string, unknown> } & Record<string, unknown>;
type RawSnapshot = {
  nodes?: RawElement[];
  edges?: RawElement[];
  meta?: Record<string, unknown>;
};

function flatten(raw: RawSnapshot | undefined): GraphSnapshot {
  if (!raw) return EMPTY_SNAPSHOT;
  const nodes = (raw.nodes ?? []).map((n) => (n.data ?? n)) as unknown as GraphSnapshot["nodes"];
  const edges = (raw.edges ?? []).map((e) => (e.data ?? e)) as unknown as GraphSnapshot["edges"];
  const meta = (raw.meta ?? {}) as unknown as GraphSnapshot["meta"];
  return { nodes, edges, meta };
}

export function GraphCanvas() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const [legend, setLegend] = useState<LegendSummary | null>(null);

  const canvasCleared = useGraphStore((s) => s.canvasCleared);
  const setStats = useGraphStore((s) => s.setStats);
  const selectNode = useGraphStore((s) => s.selectNode);
  const filters = useGraphStore((s) => s.filters);
  const layout = useGraphStore((s) => s.layout);
  const openModal = useUIStore((s) => s.openModal);
  const setDefaultRepoUrl = useUIStore((s) => s.setDefaultRepoUrl);

  const { data: rawData } = useQuery<RawSnapshot>({
    queryKey: ["graph"],
    queryFn: () => apiFetch<RawSnapshot>("/api/graph", token),
    enabled: !!token,
    refetchOnWindowFocus: false,
  });

  // Flatten the cytoscape-style wrapper once per refetch.
  const data = useMemo(() => flatten(rawData), [rawData]);

  // Auto-open SourcesModal with curl/curl prefilled when the graph is empty.
  useEffect(() => {
    if (!rawData) return;
    if (data.nodes.length === 0) {
      setDefaultRepoUrl(DEFAULT_REPO_URL);
      openModal("sources" as ModalName);
    }
  }, [rawData, data, openModal, setDefaultRepoUrl]);

  const effective = canvasCleared ? EMPTY_SNAPSHOT : data;

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const gatewayHost =
    window.location.hostname === "localhost"
      ? `${window.location.hostname}:8180`
      : `substrate.${window.location.hostname.split(".").slice(-2).join(".")}`;
  const wsUrl = import.meta.env.VITE_WS_URL || `${proto}//${gatewayHost}`;

  return (
    <div
      className="relative w-full h-full"
      style={{
        contain: "layout paint size",
        touchAction: "none",
        overscrollBehavior: "contain",
      }}
    >
      <div
        className="w-full h-full rounded-2xl overflow-hidden relative"
        style={{
          background: "rgba(13,13,18,0.8)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
        }}
      >
        <Graph
          snapshot={effective}
          wsUrl={wsUrl}
          authToken={token}
          layout={layout}
          filter={{ types: Array.from(filters.types) }}
          onNodeClick={(node: NodeData) =>
            selectNode(node.id, node as unknown as Record<string, unknown>)
          }
          onStatsChange={setStats}
          onLegendChange={setLegend}
          className="w-full h-full"
        />
        <SignalsOverlay />
        <ViolationBadge />
        <DynamicLegend legend={legend} />
      </div>
    </div>
  );
}
