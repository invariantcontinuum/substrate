import { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import cytoscape from "cytoscape";
import { cytoscapeStyles } from "@/lib/graph-styles";
import { useGraphData } from "./useGraphData";
import { useGraphSocket } from "./useGraphSocket";
import { useGraphStore } from "@/stores/graph";
import { GraphLegend } from "./GraphLegend";
import { StatusCarousel } from "./StatusCarousel";

function OrbitalLoader() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-4">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="w-full h-full animate-spin" style={{ animationDuration: "3s" }}>
          <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="1" />
          <circle cx="32" cy="32" r="20" fill="none" stroke="rgba(99,102,241,0.06)" strokeWidth="0.5" />
          <circle
            cx="32" cy="32" r="28" fill="none"
            stroke="rgba(99,102,241,0.5)"
            strokeWidth="1.5"
            strokeDasharray="12 164"
            strokeLinecap="round"
          />
        </svg>
        <div
          className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "#6366f1", boxShadow: "0 0 12px #6366f1" }}
        />
      </div>
      <span className="text-[11px] tracking-wider" style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
        Loading graph...
      </span>
    </div>
  );
}

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const { data, isLoading } = useGraphData();
  const selectNode = useGraphStore((s) => s.selectNode);
  const setStats = useGraphStore((s) => s.setStats);
  const layout = useGraphStore((s) => s.layout);

  const handleHover = useCallback((cy: cytoscape.Core) => {
    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).style({ opacity: 0.15 });
      neighborhood.style({ opacity: 1 });
      node.style({ "border-width": 2.5, "z-index": 10 });
    });

    cy.on("mouseout", "node", () => {
      cy.elements().style({ opacity: 1 });
      cy.nodes().forEach((n) => {
        const type = n.data("type") || "service";
        const isSelected = n.selected();
        n.style({
          "border-width": isSelected ? 2 : (type === "external" ? 1 : 1.5),
          "z-index": 0,
        });
      });
    });
  }, []);

  const handleZoomLabels = useCallback((cy: cytoscape.Core) => {
    cy.on("zoom", () => {
      const zoom = cy.zoom();
      const showLabels = zoom > 0.7;
      cy.nodes().style({
        "font-size": showLabels ? undefined : "0px",
        label: showLabels ? "data(name)" : "",
      });
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: cytoscapeStyles,
      minZoom: 0.2,
      maxZoom: 3.0,
      boxSelectionEnabled: false,
      wheelSensitivity: 0.3,
    });

    cy.on("tap", "node", (evt) => selectNode(evt.target.id()));
    cy.on("tap", (evt) => { if (evt.target === cy) selectNode(null); });

    handleHover(cy);
    handleZoomLabels(cy);

    cyRef.current = cy;
    return () => { cy.destroy(); cyRef.current = null; };
  }, [selectNode, handleHover, handleZoomLabels]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !data) return;

    cy.elements().remove();
    cy.add([...data.nodes, ...data.edges]);

    const nodeCount = cy.nodes().length;
    const staggerDelay = Math.min(60, 3000 / Math.max(nodeCount, 1));

    cy.nodes().forEach((node, i) => {
      node.style("opacity", 0);
      setTimeout(() => {
        node.animate({ style: { opacity: 1 } }, { duration: 250 });
      }, i * staggerDelay);
    });

    cy.edges().forEach((edge, i) => {
      edge.style("opacity", 0);
      setTimeout(() => {
        edge.animate({ style: { opacity: 1 } }, { duration: 350 });
      }, Math.min(nodeCount * staggerDelay, 3000) + i * Math.min(40, 2000 / Math.max(cy.edges().length, 1)));
    });

    cy.layout({ name: layout, animate: true, animationDuration: 500 }).run();
    cy.fit(undefined, 50);

    setStats({
      nodeCount: data.meta.node_count,
      edgeCount: data.meta.edge_count,
      lastUpdated: new Date().toISOString(),
    });
  }, [data, layout, setStats]);

  useGraphSocket(cyRef);

  return (
    <motion.div
      className="relative flex-1 h-full grid-bg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      {isLoading && <OrbitalLoader />}
      <div ref={containerRef} className="w-full h-full" />
      <StatusCarousel />
      <GraphLegend />
    </motion.div>
  );
}
