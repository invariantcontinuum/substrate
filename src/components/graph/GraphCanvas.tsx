import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { cytoscapeStyles } from "@/lib/graph-styles";
import { useGraphData } from "./useGraphData";
import { useGraphSocket } from "./useGraphSocket";
import { useGraphStore } from "@/stores/graph";
import { GraphLegend } from "./GraphLegend";
import { StatusCarousel } from "./StatusCarousel";

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const { data, isLoading } = useGraphData();
  const selectNode = useGraphStore((s) => s.selectNode);
  const setStats = useGraphStore((s) => s.setStats);
  const layout = useGraphStore((s) => s.layout);

  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: cytoscapeStyles,
      minZoom: 0.4,
      maxZoom: 2.5,
      boxSelectionEnabled: false,
    });

    cy.on("tap", "node", (evt) => {
      selectNode(evt.target.id());
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) selectNode(null);
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [selectNode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !data) return;

    cy.elements().remove();
    cy.add([...data.nodes, ...data.edges]);

    cy.nodes().forEach((node, i) => {
      node.style("opacity", 0);
      setTimeout(() => {
        node.animate({ style: { opacity: 1 } }, { duration: 300 });
      }, i * 60);
    });

    cy.edges().forEach((edge, i) => {
      edge.style("opacity", 0);
      setTimeout(() => {
        edge.animate({ style: { opacity: 1 } }, { duration: 400 });
      }, 800 + i * 40);
    });

    cy.layout({ name: layout, animate: true, animationDuration: 500 }).run();
    cy.fit(undefined, 40);

    setStats({
      nodeCount: data.meta.node_count,
      edgeCount: data.meta.edge_count,
      lastUpdated: new Date().toISOString(),
    });
  }, [data, layout, setStats]);

  useGraphSocket(cyRef);

  return (
    <div className="relative flex-1 h-full grid-bg">
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{ color: "#4a4a60" }}
        >
          Loading graph...
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      <StatusCarousel />
      <GraphLegend />
    </div>
  );
}
