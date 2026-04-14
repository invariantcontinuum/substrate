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
              // Size each rectangle by its label length. `width: "label"`
              // is deprecated in cytoscape; a mapper function gives us
              // the same auto-sizing without the deprecation warning.
              // ~6.2px per char at font-size 10 matches the rendered
              // text width well enough; clamp to a minimum so
              // very-short labels still form a comfortable tap target.
              width: (ele: cytoscape.NodeSingular) => {
                const label = String(ele.data("label") ?? "");
                return Math.max(36, Math.min(label.length * 6.2 + 16, 280));
              },
              height: 22,
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
        // Cytoscape warns against customising wheelSensitivity because
        // the step feel depends on OS/mouse/trackpad. Stick to the
        // default so zoom speed matches the platform the user already
        // tuned their pointer for.
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

      cyRef.current = cy;
      setReady(true);
    };
    init();
    return () => {
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
    cy.layout({ name: effectiveLayout as any, padding: 30, animate: false, fit: true }).run();
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
