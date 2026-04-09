import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";

export function GraphPage() {
  return (
    <div className="flex h-full">
      <GraphCanvas />
      <NodeDetailPanel />
    </div>
  );
}
