import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/panels/NodeDetailPanel";
import { SearchBar } from "@/components/layout/SearchBar";

export function GraphPage() {
  return (
    <div className="graph-page">
      {/* Phone-only search row: on ≤640px the top-nav hides its center
       *  slot, but the user still needs a fast search entry point without
       *  opening a modal. This row shows up-only on mobile and hides on
       *  desktop so the top-nav search stays the single source of truth
       *  on large viewports. */}
      <div className="graph-mobile-search">
        <SearchBar />
      </div>
      <div className="graph-canvas-wrapper">
        <GraphCanvas />
      </div>
      <NodeDetailPanel />
    </div>
  );
}
