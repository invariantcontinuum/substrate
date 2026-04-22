import { LayoutGrid, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { GraphHandle } from "@invariantcontinuum/graph/react";

export function Toolbar({ engineRef }: { engineRef: React.RefObject<GraphHandle | null> }) {
  return (
    <div className="graph-toolbar">
      <button onClick={() => engineRef.current?.fit(48)}          title="Fit"       aria-label="Fit">       <Maximize2  size={16} strokeWidth={1.75} /></button>
      <button onClick={() => engineRef.current?.zoomIn()}         title="Zoom in"   aria-label="Zoom in">   <ZoomIn     size={16} strokeWidth={1.75} /></button>
      <button onClick={() => engineRef.current?.zoomOut()}        title="Zoom out"  aria-label="Zoom out">  <ZoomOut    size={16} strokeWidth={1.75} /></button>
      <button onClick={() => engineRef.current?.relayout("grid")} title="Relayout"  aria-label="Relayout">  <LayoutGrid size={16} strokeWidth={1.75} /></button>
    </div>
  );
}
