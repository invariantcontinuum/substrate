import { useEffect } from "react";
import type { GraphHandle } from "@invariantcontinuum/graph/react";
import { useGraphStore } from "@/stores/graph";

export function useSelectionSync(
  engineRef: React.RefObject<GraphHandle | null>,
  ready: boolean,
): void {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  useEffect(() => {
    if (!ready) return;
    if (selectedNodeId) {
      engineRef.current?.focusFit(selectedNodeId, 80);
      return;
    }
    engineRef.current?.selectNode(null);
  }, [selectedNodeId, ready, engineRef]);
}
