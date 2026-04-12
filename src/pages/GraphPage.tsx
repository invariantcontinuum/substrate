import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";

export function GraphPage() {
  return (
    <div className="h-full p-4 flex">
      <div className="flex-1">
        <GraphCanvas />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
