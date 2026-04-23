import { useEffect } from "react";
import type { GraphHandle } from "@invariantcontinuum/graph/react";
import { useGraphStore } from "@/stores/graph";

/**
 * Mirrors `selectedNodeId` from the Zustand store onto the engine's spotlight
 * state WITHOUT moving the camera. The rule we follow is Cytoscape-parity:
 * clicks on a node spotlight it in place; the camera only moves when the
 * user explicitly asks for it via Fit, Zoom, or the search / neighbor
 * buttons — each of those call sites invokes `engineRef.current.focusFit`
 * itself. The prior implementation here re-called `focusFit` on every
 * selection change, which meant every canvas click triggered a pan+zoom
 * tween that the user never asked for; sequential neighbor-clicks produced
 * a disorienting staircase of zoom changes.
 */
export function useSelectionSync(
  engineRef: React.RefObject<GraphHandle | null>,
  ready: boolean,
): void {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.selectNode(selectedNodeId);
  }, [selectedNodeId, ready, engineRef]);
}
