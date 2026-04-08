import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { FilterPanel } from "@/components/graph/FilterPanel";
import { NodeDetailPanel } from "@/components/graph/NodeDetailPanel";

export function GraphPage() {
  return (
    <div className="flex h-full">
      <FilterPanel />
      <GraphCanvas />
      <NodeDetailPanel />
    </div>
  );
}
