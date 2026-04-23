import { useCallback, useMemo } from "react";
import { GraphScene } from "@invariantcontinuum/graph/react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";
import { Toolbar } from "./chrome/Toolbar";
import { useGraphEngine } from "./engine/useGraphEngine";
import { useGraphSnapshot } from "./engine/useGraphSnapshot";
import { useSelectionSync } from "./engine/useSelectionSync";
import { useSources } from "@/hooks/useSources";

/**
 * App-side composition root: supplies the data (stores, sync sources, focus
 * set) and drops it into <GraphScene> from the package. Every pixel on the
 * graph canvas — nodes, edges, labels, grid, frames, spotlight — is owned by
 * @invariantcontinuum/graph; this component is just plumbing.
 */
export function GraphCanvas() {
  const themeMode = useThemeStore((s) => s.theme);

  // useGraphEngine still builds its own engine-theme JSON internally for the
  // keyboard-shortcut effects (Ctrl+0 fit, Esc clear, etc.) — we only use
  // its imperative methods here, not its theme output.
  const { engineRef, onReady, onPositionsReady, onStatsChange } = useGraphEngine({});
  const { snapshot, nodeIds, labels, nodeTypeMap, nodeSourceIds } = useGraphSnapshot();
  useSelectionSync(engineRef, true);

  const { sources } = useSources();
  const sourceLabels = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, `${s.owner}/${s.name}`])),
    [sources],
  );

  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const onNodeClick = useCallback(
    (node: { id: string }) => {
      setSelectedNodeId(node.id);
      openModal("nodeDetail");
    },
    [setSelectedNodeId, openModal],
  );
  // Background click clears spotlight — Cytoscape-style. Dismissing the
  // detail panel too avoids a dangling panel with no graph selection.
  const onBackgroundClick = useCallback(() => {
    setSelectedNodeId(null);
    closeModal();
  }, [setSelectedNodeId, closeModal]);

  // Spotlight 1-hop set: passed to GraphScene so LabelOverlay dims non-focus
  // labels in sync with the WASM shader's node-fill dim. O(E) per selection.
  const focusIds = useMemo<Set<string> | null>(() => {
    if (!selectedNodeId) return null;
    const set = new Set<string>([selectedNodeId]);
    for (const e of snapshot.edges) {
      if (e.source === selectedNodeId) set.add(e.target);
      else if (e.target === selectedNodeId) set.add(e.source);
    }
    return set;
  }, [selectedNodeId, snapshot.edges]);

  return (
    <div className="graph-canvas">
      <div className="graph-canvas-inner">
        <GraphScene
          ref={engineRef}
          themeMode={themeMode}
          snapshot={snapshot}
          layout="grid"
          nodeIds={nodeIds}
          labels={labels}
          nodeTypes={nodeTypeMap}
          nodeSourceIds={nodeSourceIds}
          sourceLabels={sourceLabels}
          focusIds={focusIds}
          onNodeClick={onNodeClick}
          onBackgroundClick={onBackgroundClick}
          onReady={onReady}
          onStatsChange={onStatsChange}
          onPositionsReady={onPositionsReady}
          className="graph-canvas-container"
        />
      </div>

      <div className="graph-overlay-bottom-left"><SignalsOverlay /></div>
      <div className="graph-overlay-top-right"><ViolationBadge /></div>
      <div className="graph-overlay-bottom-right"><DynamicLegend /></div>
      <Toolbar engineRef={engineRef} />
    </div>
  );
}
