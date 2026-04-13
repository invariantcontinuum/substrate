import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";

export function GraphPage() {
  return (
    <div className="h-full flex overflow-hidden">
      <div className="flex-1 min-w-0 h-full p-2">
        <GraphCanvas />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
