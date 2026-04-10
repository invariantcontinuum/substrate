import { Graph } from "@invariantcontinuum/graph/react";
import type { NodeData } from "@invariantcontinuum/graph/react";
import { useAuth } from "react-oidc-context";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";
import { FilterPanel } from "@/components/graph/FilterPanel";
import { useGraphStore } from "@/stores/graph";
import { graphTheme } from "@/lib/graph-theme";
import { SEED_SNAPSHOT } from "@/lib/seed-data";

export function GraphPage() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const { layout, filters, selectNode, setStats } = useGraphStore();

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const gatewayHost =
    window.location.hostname === "localhost"
      ? `${window.location.hostname}:8180`
      : `substrate.${window.location.hostname.split(".").slice(-2).join(".")}`;
  const wsUrl = import.meta.env.VITE_WS_URL || `${proto}//${gatewayHost}`;

  return (
    <div className="flex h-full">
      <FilterPanel />
      <div className="flex-1 relative">
        <Graph
          snapshot={SEED_SNAPSHOT}
          wsUrl={wsUrl}
          authToken={token}
          theme={graphTheme}
          layout={layout}
          filter={{ types: Array.from(filters.types) }}
          onNodeClick={(node: NodeData) => selectNode(node.id, node as unknown as Record<string, unknown>)}
          onStatsChange={setStats}
          className="w-full h-full"
        />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
