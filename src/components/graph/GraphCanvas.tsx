import { useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { loadCytoscape } from "@/lib/cytoscapeLoader";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";

// Above this many nodes we skip force-directed simulation (O(n²)) and
// fall back to the deterministic `grid` layout. Cytoscape can render
// thousands of nodes fine — the layout algorithm is what locks the
// main thread.
const FORCE_LAYOUT_MAX_NODES = 200;

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [ready, setReady] = useState(false);
  const { isMobile } = useResponsive();

  // Subscribe to each slice individually so we only re-render on relevant changes.
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const signals = useGraphStore((s) => s.signals);
  const layoutName = useGraphStore((s) => s.layoutName);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setZoom = useGraphStore((s) => s.setZoom);
  const setLayoutName = useGraphStore((s) => s.setLayoutName);
  const setPan = useGraphStore((s) => s.setPan);

  const openModal = useUIStore((s) => s.openModal);

  // Apply the legend filter: only nodes whose type is currently toggled on
  // are rendered, and only edges between two visible nodes survive.
  const filtered = useMemo(() => {
    const visibleNodes = nodes.filter((n) =>
      visibleTypes.has(String(n.type || "unknown"))
    );
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = edges.filter(
      (e) => visibleIds.has(e.source) && visibleIds.has(e.target)
    );
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [nodes, edges, visibleTypes]);

  /* init cytoscape */
  useEffect(() => {
    if (!containerRef.current || cyRef.current) return;
    const init = async () => {
      const cytoscape = await loadCytoscape();
      const cy = cytoscape({
        container: containerRef.current,
        elements: [],
        style: [
          {
            selector: "node",
            style: {
              shape: "rectangle",
              // Auto-size each rectangle to fit the label text.
              width: "label",
              height: "label",
              "padding-left": "8px",
              "padding-right": "8px",
              "padding-top": "6px",
              "padding-bottom": "6px",
              "background-color": "#fff",
              "border-width": 1,
              "border-color": "#000",
              label: "data(label)",
              "font-size": 10,
              "text-valign": "center",
              "text-halign": "center",
              "text-wrap": "none",
              color: "#000",
              "text-outline-width": 0,
            },
          },
          {
            selector: "edge",
            style: {
              width: 1,
              "line-color": "#000",
              "target-arrow-color": "#000",
              "target-arrow-shape": "triangle",
              "curve-style": "straight",
            },
          },
          {
            selector: ":selected",
            style: {
              "border-width": 3,
              "border-color": "#000",
              "background-color": "#f0f0f0",
            },
          },
        ],
        minZoom: 0.05,
        maxZoom: 3,
        // Faster zoom step per wheel tick. 0.15 was imperceptible on trackpads.
        wheelSensitivity: 0.6,
        userPanningEnabled: true,
        userZoomingEnabled: true,
        autoungrabify: false,
        // Performance tuning for large graphs (thousands of nodes):
        // render a static texture while the user pans/zooms, and skip
        // drawing edges during interaction.
        textureOnViewport: true,
        hideEdgesOnViewport: true,
        pixelRatio: 1,
      });

      cy.on("tap", "node", (evt) => {
        const id = evt.target.id() as string;
        setSelectedNodeId(id);
        openModal("nodeDetail");
      });

      cy.on("tap", (evt) => {
        if (evt.target === cy) setSelectedNodeId(null);
      });

      cy.on("zoom", () => setZoom(cy.zoom()));
      cy.on("pan", () => setPan(cy.pan()));

      // Two-finger trackpad scroll → pan (Chrome/Edge/Firefox/Safari desktop).
      //
      // Default cytoscape behaviour treats every wheel event as zoom, which
      // breaks trackpad users who expect two-finger scroll to move the graph.
      // Browser convention for trackpads: pinch gestures come through as
      // wheel events with `ctrlKey === true` (including Chrome's synthetic
      // ctrlKey for pinch), while two-finger scrolls come through without it.
      // We intercept wheel events in the capture phase and hand off:
      //   - ctrlKey            → let cytoscape handle (zoom)
      //   - Shift+wheel        → horizontal pan
      //   - plain wheel        → pan by deltaX/deltaY
      // Attached with `passive: false` so `preventDefault()` blocks page
      // scroll and cytoscape's own zoom.
      const container = containerRef.current;
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey) return; // pinch-zoom or Ctrl+wheel → cytoscape zooms
        e.preventDefault();
        e.stopPropagation();
        // Line / page wheel modes report bigger deltas; normalise to pixels.
        const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
        const dx = (e.shiftKey ? e.deltaY : e.deltaX) * factor;
        const dy = (e.shiftKey ? 0 : e.deltaY) * factor;
        cy.panBy({ x: -dx, y: -dy });
      };
      container?.addEventListener("wheel", onWheel, { capture: true, passive: false });

      cyRef.current = cy;
      (cyRef as any).__onWheel = onWheel;
      setReady(true);
    };
    init();
    return () => {
      const container = containerRef.current;
      const onWheel = (cyRef as any).__onWheel as EventListener | undefined;
      if (container && onWheel) {
        container.removeEventListener("wheel", onWheel, { capture: true } as any);
      }
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [setSelectedNodeId, setZoom, setPan, openModal]);

  /* update elements */
  useEffect(() => {
    if (!ready || !cyRef.current) return;
    const cy = cyRef.current;
    cy.batch(() => {
      cy.elements().remove();
      if (filtered.nodes.length) {
        cy.add(
          filtered.nodes.map((n) => {
            const label =
              (n.label as string | undefined) ||
              (n.name as string | undefined) ||
              (n.id as string);
            return { data: { ...n, id: n.id, label } };
          })
        );
      }
      if (filtered.edges.length) {
        cy.add(
          filtered.edges.map((e) => ({
            data: { ...e, id: e.id, source: e.source, target: e.target, label: e.label },
          }))
        );
      }
    });
    // Pick a cheap, deterministic layout when the graph is large so we don't
    // lock the main thread on a force-directed simulation.
    const effectiveLayout =
      filtered.nodes.length > FORCE_LAYOUT_MAX_NODES ? "grid" : (layoutName || "cose");
    cy.layout({ name: effectiveLayout as any, padding: isMobile ? 24 : 48, animate: false, fit: true }).run();
  }, [filtered, layoutName, ready, isMobile]);

  // Zoom/pan flow one-way: cytoscape → store via the `zoom`/`pan` events
  // registered in init. We deliberately don't push store zoom back into
  // cytoscape here — that would create a feedback loop with the event
  // listener (each zoom event sets store, which re-applies zoom, which
  // fires another zoom event, etc.), locking the main thread.

  /* selection highlight */
  useEffect(() => {
    if (!cyRef.current) return;
    cyRef.current.nodes().unselect();
    if (selectedNodeId) cyRef.current.getElementById(selectedNodeId).select();
  }, [selectedNodeId]);

  /* signals pulse */
  useEffect(() => {
    if (!cyRef.current || !signals.length) return;
    const cy = cyRef.current;
    const ids = new Set(signals.map((s) => s.nodeId));
    ids.forEach((id) => {
      const n = cy.getElementById(id);
      if (!n.length) return;
      n.animate({ style: { "border-width": 6 } }, { duration: 250 });
      setTimeout(() => {
        n.animate({ style: { "border-width": 2 } }, { duration: 250 });
      }, 260);
    });
  }, [signals]);

  // Node size is driven by the label (shape: rectangle, width/height: "label")
  // so there's nothing to sync here.

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "0") {
          e.preventDefault();
          cyRef.current?.fit(undefined, 48);
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          cyRef.current?.zoom(cyRef.current.zoom() * 1.1);
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          cyRef.current?.zoom(cyRef.current.zoom() * 0.9);
        }
      }
      if (e.key === "Escape") {
        setSelectedNodeId(null);
      }
      if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey) {
        setLayoutName(layoutName === "cose" ? "breadthfirst" : "cose");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutName, setLayoutName, setSelectedNodeId]);

  return (
    <div className="graph-canvas">
      <div className="graph-canvas-inner">
        <div ref={containerRef} className="graph-canvas-container" />
      </div>

      <div className="graph-overlay-group">
        <SignalsOverlay />
        <ViolationBadge />
        <DynamicLegend />
      </div>

      <div className="graph-toolbar">
        <button onClick={() => cyRef.current?.fit(undefined, 48)} title="Fit">⊘</button>
        <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.1)} title="Zoom in">+</button>
        <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.9)} title="Zoom out">−</button>
        <button onClick={() => setLayoutName(layoutName === "cose" ? "breadthfirst" : "cose")} title="Relayout">L</button>
      </div>
    </div>
  );
}
