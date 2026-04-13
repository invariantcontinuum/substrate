import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";

export function GraphPage() {
  return (
    <div className="h-full flex overflow-hidden bg-[#050508]">
      <div className="flex-1 min-w-0 min-h-0 h-full p-3">
        <GraphCanvas />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
