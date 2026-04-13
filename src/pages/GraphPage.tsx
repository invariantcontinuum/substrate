import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";

export function GraphPage() {
  return (
    <div className="h-full flex bg-white">
      <div className="flex-1 min-w-0 min-h-0 p-4">
        <div className="w-full h-full rounded-2xl border-2 border-black overflow-hidden bg-white">
          <GraphCanvas />
        </div>
      </div>
      <NodeDetailPanel />
    </div>
  );
}
