import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/panels/NodeDetailPanel";

export function GraphPage() {
  return (
    <div className="graph-page">
      <div className="graph-canvas-wrapper">
        <GraphCanvas />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
