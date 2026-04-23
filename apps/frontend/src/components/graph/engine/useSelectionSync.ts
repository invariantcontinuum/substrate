import { useEffect } from "react";
import type { GraphHandle } from "@invariantcontinuum/graph/react";
import { useGraphStore } from "@/stores/graph";

/**
 * Mirrors `selectedNodeId` from the Zustand store onto the engine's spotlight
 * + camera state using the Cytoscape `cy.center(node)` convention:
 *   - Click a node → spotlight AND pan-only (zoom preserved). The selected
 *     node slides into the viewport center so it's trivially findable in a
 *     10 000-node graph.
 *   - `focusFit` (aggressive zoom-to-neighborhood) is reserved for search
 *     picks, which are the only path where the user is likely navigating
 *     to a node far outside the current viewport — those call sites invoke
 *     `engineRef.current.focusFit` directly.
 *   - Clearing the selection (null) clears the spotlight but leaves the
 *     camera where the user left it.
 */
export function useSelectionSync(
  engineRef: React.RefObject<GraphHandle | null>,
  ready: boolean,
): void {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.selectNode(selectedNodeId);
    if (selectedNodeId) {
      engineRef.current?.panToNode(selectedNodeId);
    }
  }, [selectedNodeId, ready, engineRef]);
}
