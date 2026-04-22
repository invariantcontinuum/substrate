import { useCallback, useMemo } from "react";
import { Graph } from "@invariantcontinuum/graph/react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";
import { LabelOverlay } from "./LabelOverlay";
import { GridOverlay } from "./overlays/GridOverlay";
import { Toolbar } from "./chrome/Toolbar";
import { buildGraphTheme } from "./theme/buildTheme";
import { graphThemeToEngineJson } from "./theme/toEngineTheme";
import { useGraphEngine } from "./engine/useGraphEngine";
import { useGraphSnapshot } from "./engine/useGraphSnapshot";
import { useSelectionSync } from "./engine/useSelectionSync";

export function GraphCanvas() {
  const themeMode = useThemeStore((s) => s.theme);
  const graphTheme = useMemo(() => buildGraphTheme(themeMode), [themeMode]);
  const engineThemeJson = useMemo(() => graphThemeToEngineJson(graphTheme), [graphTheme]);

  const { engineRef, ready, onReady, onPositionsReady, onStatsChange } = useGraphEngine(engineThemeJson);
  const { snapshot, nodeIds, labels, nodeTypeMap } = useGraphSnapshot();
  useSelectionSync(engineRef, ready);

  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const openModal = useUIStore((s) => s.openModal);
  const onNodeClick = useCallback((node: { id: string }) => {
    setSelectedNodeId(node.id);
    openModal("nodeDetail");
  }, [setSelectedNodeId, openModal]);

  return (
    <div className="graph-canvas">
      <div className="graph-canvas-inner">
        <div
          className="graph-canvas-container"
          data-spotlight-active={selectedNodeId ? "true" : "false"}
          style={{ position: "relative" }}
        >
          <GridOverlay engineRef={engineRef} theme={graphTheme} ready={ready} />
          <Graph
            ref={engineRef}
            snapshot={snapshot}
            theme={engineThemeJson as Record<string, unknown>}
            layout="grid"
            onNodeClick={onNodeClick}
            onReady={onReady}
            onStatsChange={onStatsChange}
            onPositionsReady={onPositionsReady}
            className="graph-canvas-webgl"
            style={{ width: "100%", height: "100%" }}
          />
          <LabelOverlay
            engineRef={engineRef}
            theme={graphTheme}
            nodeIds={nodeIds}
            labels={labels}
            nodeTypes={nodeTypeMap}
            ready={ready}
            minZoomToShowLabels={0.0}
          />
        </div>
      </div>

      <div className="graph-overlay-bottom-left"><SignalsOverlay /></div>
      <div className="graph-overlay-top-right"><ViolationBadge /></div>
      <div className="graph-overlay-bottom-right"><DynamicLegend /></div>
      <Toolbar engineRef={engineRef} />
    </div>
  );
}
