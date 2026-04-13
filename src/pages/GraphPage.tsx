import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";

export function GraphPage() {
  return (
    <div>
      <div>
        <GraphCanvas />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
