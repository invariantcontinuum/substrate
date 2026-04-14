import { useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { loadCytoscape } from "@/lib/cytoscapeLoader";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";

// Large force-directed layouts are O(n²) and freeze the browser.
// Above this many nodes we switch to a cheap deterministic layout and
// sample the graph so rendering stays responsive.
const MAX_RENDERED_NODES = 400;
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
  const nodeSize = useGraphStore((s) => s.nodeSize);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setZoom = useGraphStore((s) => s.setZoom);
  const setLayoutName = useGraphStore((s) => s.setLayoutName);
  const setPan = useGraphStore((s) => s.setPan);

  const openModal = useUIStore((s) => s.openModal);

  // Sample/trim to a manageable size before layout.
  const displayed = useMemo(() => {
    if (nodes.length <= MAX_RENDERED_NODES) {
      return { nodes, edges };
    }
    const kept = nodes.slice(0, MAX_RENDERED_NODES);
    const keptIds = new Set(kept.map((n) => n.id));
    const keptEdges = edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));
    return { nodes: kept, edges: keptEdges };
  }, [nodes, edges]);

  const tooLarge = nodes.length > MAX_RENDERED_NODES;

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
              width: nodeSize,
              height: nodeSize,
              "background-color": "#fff",
              "border-width": 2,
              "border-color": "#000",
              label: "data(label)",
              "font-size": 10,
              "text-valign": "center",
              "text-halign": "center",
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
              "curve-style": "unbundled-bezier",
              "control-point-distances": 24,
              "control-point-weights": 0.5,
            },
          },
          {
            selector: ":selected",
            style: {
              "border-width": 4,
              "border-color": "#000",
              "background-color": "#f0f0f0",
            },
          },
        ],
        minZoom: 0.05,
        maxZoom: 3,
        wheelSensitivity: 0.15,
        userPanningEnabled: true,
        userZoomingEnabled: true,
        autoungrabify: false,
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

      cyRef.current = cy;
      setReady(true);
    };
    init();
    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [nodeSize, setSelectedNodeId, setZoom, setPan, openModal]);

  /* update elements */
  useEffect(() => {
    if (!ready || !cyRef.current) return;
    const cy = cyRef.current;
    cy.elements().remove();
    if (displayed.nodes.length) cy.add(displayed.nodes.map((n) => ({ data: { ...n, id: n.id, label: n.label } })));
    if (displayed.edges.length) cy.add(displayed.edges.map((e) => ({ data: { ...e, id: e.id, source: e.source, target: e.target, label: e.label } })));
    // Pick a cheap, deterministic layout when the graph is large so we don't
    // lock the main thread on a force-directed simulation.
    const effectiveLayout =
      displayed.nodes.length > FORCE_LAYOUT_MAX_NODES ? "grid" : (layoutName || "cose");
    cy.layout({ name: effectiveLayout as any, padding: isMobile ? 24 : 48, animate: false, fit: true }).run();
  }, [displayed, layoutName, ready, isMobile]);

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

  /* node size sync */
  useEffect(() => {
    cyRef.current?.style().selector("node").style("width", nodeSize).style("height", nodeSize).update();
  }, [nodeSize]);

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

      {tooLarge && (
        <div className="graph-truncation-notice">
          Showing {displayed.nodes.length} of {nodes.length} nodes — filter to view the rest.
        </div>
      )}

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
