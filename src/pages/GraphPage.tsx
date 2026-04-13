import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";

export function GraphPage() {
  return (
    <div className="h-full flex gap-4 bg-white p-4">
      <div className="relative flex-1 min-w-0 min-h-0 rounded-2xl border-2 border-black overflow-hidden bg-white">
        <GraphCanvas />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
