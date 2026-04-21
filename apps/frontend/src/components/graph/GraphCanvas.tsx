import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import {
  Graph,
  type GraphHandle,
  type GraphSnapshot,
} from "@invariantcontinuum/graph/react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";
import { LabelOverlay } from "./LabelOverlay";
import { buildGraphTheme, graphThemeToEngineJson } from "./styleAdapter";

/**
 * GraphCanvas — thin React wrapper around the graph-ui WASM+WebGL2 engine.
 *
 * The component owns three responsibilities:
 *   1. Translate the Zustand graph store (slim nodes + edges) into the
 *      `GraphSnapshot` shape the engine expects.
 *   2. Build a theme from the current ThemeStore mode and push it into
 *      the engine on swap (the engine does not observe CSS variables).
 *   3. Render the <Graph> canvas plus a DOM-layer LabelOverlay and the
 *      existing chrome (signals, violation badge, legend, toolbar).
 *
 * The old Cytoscape implementation lived here; T17 swapped it for
 * @invariantcontinuum/graph which performs layout in a Web Worker and
 * rendering on the GPU, giving us a ~10x throughput lift for the 100k+
 * node graphs the catalogue reaches at scale.
 */
export function GraphCanvas() {
  const engineRef = useRef<GraphHandle>(null);
  const [ready, setReady] = useState(false);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const finalizeLoad = useGraphStore((s) => s.finalizeLoad);

  const openModal = useUIStore((s) => s.openModal);

  const themeMode = useThemeStore((s) => s.theme);
  const graphTheme = useMemo(() => buildGraphTheme(themeMode), [themeMode]);
  const engineThemeJson = useMemo(
    () => graphThemeToEngineJson(graphTheme),
    [graphTheme],
  );

  /* Apply theme at runtime on swap — the engine caches its theme state
   * and does not observe CSS variables, so the store's theme mutations
   * need to be pushed in imperatively. Skipped until the engine signals
   * `ready`, since `setTheme` is a no-op before WASM init completes. */
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.setTheme(engineThemeJson);
  }, [engineThemeJson, ready]);

  /* Filter nodes + edges against the active type filter set. Edge
   * survival requires both endpoints to survive the node filter to
   * avoid dangling references inside the engine. */
  const filtered = useMemo(() => {
    const visibleNodes = nodes.filter((n) =>
      visibleTypes.has(String(n.type || "unknown")),
    );
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
    );
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [nodes, edges, visibleTypes]);

  /* Build the snapshot graph-ui expects from slim nodes/edges.
   *
   * `domain` maps to SlimNode.layer (the store's architectural-layer
   * label) because graph-ui treats `domain` as the community/grouping
   * key for its hull clustering. `status` defaults to "healthy" — when
   * the violations pipeline lands (T19), we'll bridge those signals
   * in here. `meta.source_id` is preserved so downstream code (detail
   * modal, SSE-driven updates) can still attribute nodes to their
   * originating sync. */
  const snapshot = useMemo<GraphSnapshot>(
    () => ({
      nodes: filtered.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: (n.type as string) || "external",
        domain: n.layer ?? "unknown",
        status: "healthy",
        meta: { source_id: n.source_id ?? null },
      })),
      edges: filtered.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        label: "",
        weight: 1,
      })),
      meta: {
        node_count: filtered.nodes.length,
        edge_count: filtered.edges.length,
      },
    }),
    [filtered],
  );

  /* Ordered node-id list for the LabelOverlay — MUST match the order
   * of `snapshot.nodes` because the overlay maps stride-4 engine
   * position data back to ids by array index. Label and type lookup
   * maps are derived from the same ordering. */
  const nodeIds = useMemo(() => snapshot.nodes.map((n) => n.id), [snapshot]);
  const labels = useMemo(
    () => Object.fromEntries(filtered.nodes.map((n) => [n.id, n.name])),
    [filtered.nodes],
  );
  const nodeTypeMap = useMemo(
    () =>
      Object.fromEntries(
        filtered.nodes.map((n) => [n.id, (n.type as string) || "external"]),
      ),
    [filtered.nodes],
  );

  const onNodeClick = useCallback(
    (node: { id: string }) => {
      setSelectedNodeId(node.id);
      openModal("nodeDetail");
      engineRef.current?.selectNode(node.id);
    },
    [setSelectedNodeId, openModal],
  );

  const onReady = useCallback(() => {
    setReady(true);
    // Drain any in-flight load timer so the topbar reflects actual
    // fetch + render latency rather than an uncleared "pending" value.
    finalizeLoad();
    window.dispatchEvent(new CustomEvent("graph:ready"));
  }, [finalizeLoad]);

  const onStatsChange = useCallback(
    () => {
      // Fires on every worker `snapshot_loaded` / `stats` message, which
      // marks the canvas as having received the new graph data. Closes
      // the end-to-end load timer the topbar reads.
      finalizeLoad();
    },
    [finalizeLoad],
  );

  const onPositionsReady = useCallback(() => {
    // The worker has emitted its first positions buffer after a snapshot
    // load. This is the correct moment to fit the camera — the engine's
    // positions buffer is populated and the AABB is real. Replaces the
    // previous 100ms setTimeout race.
    engineRef.current?.fit(48);
  }, []);

  /* Auto-fit is now driven by onPositionsReady from the <Graph> component,
   * which fires after the worker sends its first positions message. No
   * setTimeout race. */

  /* Drive the engine's internal selection/spotlight state from the
   * store. A null id clears the focus; a non-null id triggers a
   * spotlight dim + zoom inside the engine. */
  useEffect(() => {
    if (!ready) return;
    engineRef.current?.selectNode(selectedNodeId ?? null);
  }, [selectedNodeId, ready]);

  /* Keyboard shortcuts — forwarded to the engine's imperative handle.
   * Ctrl+0 fits all, Ctrl+= / Ctrl+- zoom, Esc clears selection. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "0") {
          e.preventDefault();
          engineRef.current?.fit(48);
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          engineRef.current?.zoomIn();
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          engineRef.current?.zoomOut();
        }
      }
      if (e.key === "Escape") setSelectedNodeId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedNodeId]);

  return (
    <div className="graph-canvas">
      <div className="graph-canvas-inner">
        <div
          className="graph-canvas-container"
          style={{ position: "relative" }}
        >
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
            minZoomToShowLabels={0.1}
          />
        </div>
      </div>

      <div className="graph-overlay-bottom-left">
        <SignalsOverlay />
      </div>

      <div className="graph-overlay-top-right">
        <ViolationBadge />
      </div>

      <div className="graph-overlay-bottom-right">
        <DynamicLegend />
      </div>

      <div className="graph-toolbar">
        <button
          onClick={() => engineRef.current?.fit(48)}
          title="Fit"
          aria-label="Fit"
        >
          <Maximize2 size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => engineRef.current?.zoomIn()}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => engineRef.current?.zoomOut()}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => engineRef.current?.relayout("grid")}
          title="Relayout"
          aria-label="Relayout"
        >
          <LayoutGrid size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
