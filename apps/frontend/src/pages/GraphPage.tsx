import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { NodeDetailPanel } from "@/components/panels/NodeDetailPanel";
import { CarouselEngine } from "@/components/carousel/CarouselEngine";

/**
 * Graph page = canvas + bottom carousel strip. Nothing floats over the
 * canvas; the strip sits at the bottom of the viewport on every form
 * factor. Node inspection still opens in NodeDetailPanel (slide-in
 * modal), but only when the user taps a node — no always-on side panel
 * competing with the canvas for space.
 */
export function GraphPage() {
  return (
    <div className="graph-page">
      <div className="graph-canvas-wrapper">
        <GraphCanvas />
      </div>
      <CarouselEngine />
      <NodeDetailPanel />
    </div>
  );
}
