import { Graph } from "@invariantcontinuum/graph/react";
import { useAuth } from "react-oidc-context";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";
import { FilterPanel } from "@/components/graph/FilterPanel";
import { useGraphStore } from "@/stores/graph";
import { graphTheme } from "@/lib/graph-theme";

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
          snapshotUrl="/api/graph"
          wsUrl={wsUrl}
          authToken={token}
          theme={graphTheme}
          layout={layout}
          filter={{ types: Array.from(filters.types) }}
          onNodeClick={(node: any) => selectNode(node.id, node)}
          onStatsChange={setStats}
          className="w-full h-full"
        />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
