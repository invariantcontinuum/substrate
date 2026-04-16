import { useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { loadCytoscape } from "@/lib/cytoscapeLoader";
import { useSources } from "@/hooks/useSources";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";

const FORCE_LAYOUT_MAX_NODES = 5000;
const NODES_PER_ROW = 50;
const MAX_LABEL_CHARS = 32;
const NODE_W = MAX_LABEL_CHARS * 6.2 + 16; // ~214px — fits 32 chars at font-size 10
const NODE_H = 22;
const GAP_X = 20;
const GAP_Y = 10;
const CELL_W = NODE_W + GAP_X;
const CELL_H = NODE_H + GAP_Y;

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
  const finalizeLoad = useGraphStore((s) => s.finalizeLoad);

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

  const { sources } = useSources();
  const sourceLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources) m.set(s.id, `${s.owner}/${s.name}`);
    return m;
  }, [sources]);

  const elementsWithParents = useMemo(() => {
    const uniqueSourceIds = new Set<string>();
    for (const n of filtered.nodes) {
      const sid = (n as { source_id?: string }).source_id;
      if (sid) uniqueSourceIds.add(sid);
    }
    const parentEls = Array.from(uniqueSourceIds).map((sid) => ({
      group: "nodes" as const,
      data: {
        id: `src:${sid}`,
        label: sourceLabelMap.get(sid) ?? sid.slice(0, 8),
        isSourceParent: true,
      },
      selectable: false,
      grabbable: false,
    }));
    const childNodeEls = filtered.nodes.map((n) => {
      const sid = (n as { source_id?: string }).source_id;
      return {
        group: "nodes" as const,
        data: { ...n, parent: sid ? `src:${sid}` : undefined },
      };
    });
    const edgeEls = filtered.edges.map((e) => ({ group: "edges" as const, data: { ...e } }));
    return [...parentEls, ...childNodeEls, ...edgeEls];
  }, [filtered.nodes, filtered.edges, sourceLabelMap]);

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
              width: NODE_W,
              height: NODE_H,
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
          {
            selector: "node[?isSourceParent]",
            style: {
              shape: "rectangle",
              "background-opacity": 0,
              "border-style": "dashed" as any,
              "border-width": 1,
              "border-color": "rgba(100,120,180,0.5)",
              label: "data(label)",
              "text-valign": "top",
              "text-halign": "left",
              "font-size": 10,
              color: "rgba(0,0,0,0.5)",
              "text-margin-y": -4 as any,
              padding: "24px" as any,
            },
          },
        ],
        minZoom: 0.05,
        maxZoom: 3,
        userPanningEnabled: true,
        userZoomingEnabled: true,
        autoungrabify: false,
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

  const [loading, setLoading] = useState(false);

  /* update elements — chunked add so the main thread yields between
     batches and the rest of the UI stays interactive during large loads */
  useEffect(() => {
    if (!ready || !cyRef.current) return;
    const cy = cyRef.current;
    let cancelled = false;

    let childIdx = 0;
    const mapped = elementsWithParents.map((el) => {
      if (el.group === "nodes") {
        const d = el.data as Record<string, unknown>;
        const raw =
          (d.label as string | undefined) ||
          (d.name as string | undefined) ||
          (d.id as string);
        const label = raw.length > MAX_LABEL_CHARS
          ? raw.slice(0, MAX_LABEL_CHARS) + "\u2026"
          : raw;
        const isParent = !!d.isSourceParent;
        const gridIndex = isParent ? undefined : childIdx++;
        return { ...el, data: { ...d, label, gridIndex } };
      }
      return el;
    });

    (async () => {
      setLoading(true);
      // Yield so React can paint the loading indicator before we start
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled) return;

      cy.elements().remove();

      // Add elements in batches, yielding between them so the browser
      // can process events (clicks, scrolls, React renders). Each batch
      // is wrapped in cy.batch() to suppress per-element style recalcs.
      const CHUNK = 5000;
      for (let i = 0; i < mapped.length; i += CHUNK) {
        if (cancelled) return;
        cy.batch(() => cy.add(mapped.slice(i, i + CHUNK)));
        if (i + CHUNK < mapped.length) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (cancelled) return;

      const childNodeCount = filtered.nodes.length;
      const usePreset = childNodeCount > FORCE_LAYOUT_MAX_NODES;
      const layout = usePreset
        ? cy.layout({
            name: "preset",
            positions: (node: cytoscape.NodeSingular) => {
              const idx = node.data("gridIndex") as number | undefined;
              if (idx == null) return undefined;
              return { x: (idx % NODES_PER_ROW) * CELL_W, y: Math.floor(idx / NODES_PER_ROW) * CELL_H };
            },
            fit: true,
            padding: 30,
          } as any)
        : cy.layout({ name: (layoutName || "cose") as any, padding: 30, animate: false, fit: true });
      layout.one("layoutstop", () => {
        finalizeLoad();
        setLoading(false);
      });
      layout.run();
    })();

    return () => { cancelled = true; };
  }, [elementsWithParents, filtered.nodes.length, layoutName, ready, isMobile, finalizeLoad]);

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
        {loading && <div className="graph-loading-overlay">Loading graph…</div>}
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
