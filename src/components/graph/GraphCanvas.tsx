import { useEffect, useRef, useState } from "react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { loadCytoscape } from "@/lib/cytoscapeLoader";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [ready, setReady] = useState(false);
  const { isMobile } = useResponsive();

  const {
    nodes,
    edges,
    signals,
    layoutName,
    selectedNodeId,
    zoom,
    nodeSize,
    violations,
    setSelectedNodeId,
    setZoom,
    setLayoutName,
    setPan,
  } = useGraphStore();

  const { openModal } = useUIStore();

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
    if (nodes.length) cy.add(nodes.map((n) => ({ data: { id: n.id, label: n.label, ...n } })));
    if (edges.length) cy.add(edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label, ...e } })));
    cy.layout({ name: layoutName as any, padding: isMobile ? 24 : 48, animate: false, fit: true }).run();
  }, [nodes, edges, layoutName, ready, isMobile]);

  /* zoom sync */
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    if (Math.abs(cy.zoom() - zoom) > 0.001) cy.zoom(zoom);
  }, [zoom]);

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
