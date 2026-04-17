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
const NODE_W = 214;
const NODE_H = 22;
const GAP_X = 20;
const GAP_Y = 10;
const CELL_W = NODE_W + GAP_X;
const CELL_H = NODE_H + GAP_Y;

const cyStylesheet = [
  {
    selector: "node",
    style: {
      "background-color": "#0d0d12",
      "border-width": 1.5,
      "border-color": "rgba(255,255,255,0.12)",
      label: "data(label)",
      color: "#c0c0d8",
      "font-size": 11,
      "font-family": "Inter, sans-serif",
      "font-weight": 500,
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "none",
      width: 110,
      height: 38,
      shape: "roundrectangle",
      padding: "8px" as any,
      "z-index": 10,
    },
  },
  {
    selector: 'node[type="service"]',
    style: {
      "background-color": "#0f0f1f",
      "border-color": "#3b4199",
      "border-width": 1.5,
      color: "#c7d2fe",
    },
  },
  {
    selector: 'node[type="database"]',
    style: {
      "background-color": "#0a1a14",
      "border-color": "#065f46",
      "border-width": 1.5,
      color: "#6ee7b7",
      shape: "barrel",
    },
  },
  {
    selector: 'node[type="cache"]',
    style: {
      "background-color": "#0a1a14",
      "border-color": "#047857",
      color: "#6ee7b7",
      shape: "barrel",
    },
  },
  {
    selector: 'node[type="policy"]',
    style: {
      "background-color": "#150a2a",
      "border-color": "#7c3aed",
      "border-width": 2,
      color: "#d8b4fe",
      shape: "diamond",
      width: 110,
      height: 48,
    },
  },
  {
    selector: 'node[type="adr"]',
    style: {
      "background-color": "#1a1400",
      "border-color": "#92400e",
      color: "#fcd34d",
      shape: "roundrectangle",
      width: 80,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: 'node[type="incident"]',
    style: {
      "background-color": "#1a0505",
      "border-color": "#991b1b",
      color: "#fca5a5",
      shape: "roundrectangle",
      width: 80,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: 'node[type="external"]',
    style: {
      "background-color": "#0d1117",
      "border-color": "#374151",
      color: "#9ca3af",
      shape: "roundrectangle",
      width: 90,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: 'node[type="source"]',
    style: {
      "background-color": "#0f0f1f",
      "border-color": "#3b4199",
      "border-width": 1.5,
      color: "#c7d2fe",
    },
  },
  {
    selector: 'node[type="config"]',
    style: {
      "background-color": "#0d1117",
      "border-color": "#374151",
      color: "#9ca3af",
    },
  },
  {
    selector: 'node[type="script"]',
    style: {
      "background-color": "#1a1400",
      "border-color": "#92400e",
      color: "#fcd34d",
    },
  },
  {
    selector: 'node[type="doc"]',
    style: {
      "background-color": "#0d1117",
      "border-color": "#374151",
      color: "#9ca3af",
    },
  },
  {
    selector: 'node[type="data"]',
    style: {
      "background-color": "#0a1a14",
      "border-color": "#065f46",
      color: "#6ee7b7",
    },
  },
  {
    selector: 'node[type="asset"]',
    style: {
      "background-color": "#0d1117",
      "border-color": "#374151",
      color: "#9ca3af",
    },
  },
  {
    selector: 'node[status="violation"]',
    style: {
      "background-color": "#1a0505",
      "border-color": "#ef4444",
      "border-width": 2,
      color: "#fca5a5",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "rgba(255,255,255,0.1)",
      "target-arrow-color": "rgba(255,255,255,0.15)",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "arrow-scale": 0.8,
      label: "",
      "font-size": 9,
      color: "#666680",
      "text-background-color": "#060608",
      "text-background-opacity": 1,
      "text-background-padding": "2px" as any,
    },
  },
  {
    selector: 'edge[type="depends"]',
    style: {
      "line-color": "rgba(99,102,241,0.3)",
      "target-arrow-color": "rgba(99,102,241,0.4)",
    },
  },
  {
    selector: 'edge[type="violation"]',
    style: {
      "line-color": "#ef4444",
      "target-arrow-color": "#ef4444",
      width: 2,
      "line-style": "dashed",
      "line-dash-pattern": [6, 3] as any,
      label: "data(label)",
      color: "#ef4444",
      "font-size": 9,
    },
  },
  {
    selector: 'edge[type="enforces"]',
    style: {
      "line-color": "rgba(168,85,247,0.5)",
      "target-arrow-color": "rgba(168,85,247,0.6)",
      "line-style": "dotted",
      width: 1.5,
    },
  },
  {
    selector: 'edge[type="why"]',
    style: {
      "line-color": "rgba(245,158,11,0.5)",
      "target-arrow-color": "rgba(245,158,11,0.6)",
      "line-style": "dashed",
      "line-dash-pattern": [4, 4] as any,
      width: 1.5,
      label: "data(label)",
      color: "#f59e0b",
      "font-size": 8,
    },
  },
  {
    selector: 'edge[type="drift"]',
    style: {
      "line-color": "rgba(239,68,68,0.3)",
      "target-arrow-color": "rgba(239,68,68,0.3)",
      "line-style": "dashed",
    },
  },
  {
    selector: ":selected",
    style: {
      "border-width": 3,
      "border-color": "#6366f1",
      "background-color": "#13131f",
    },
  },
  {
    selector: "node[?isSourceParent]",
    style: {
      shape: "roundrectangle",
      "background-opacity": 0,
      "border-style": "dashed" as any,
      "border-width": 1,
      "border-color": "rgba(99,102,241,0.25)",
      label: "data(label)",
      "text-valign": "top",
      "text-halign": "left",
      "font-size": 10,
      color: "rgba(192,192,216,0.5)",
      "text-margin-y": -4 as any,
      padding: "24px" as any,
    },
  },
  /* Spotlight — applied when a node is selected from the search
   * dropdown or by click. Focused nodes + their 1-hop neighbors stay
   * fully opaque and gain larger labels; everything else fades. */
  {
    selector: ".spotlight-dim",
    style: {
      opacity: 0.12,
      "text-opacity": 0.05,
    },
  },
  {
    selector: "node.spotlight-focus",
    style: {
      opacity: 1,
      "text-opacity": 1,
      "font-size": 13,
      "border-width": 2,
      "border-color": "#89bbfe",
      "z-index": 20,
    },
  },
  {
    selector: "edge.spotlight-focus",
    style: {
      opacity: 1,
      "text-opacity": 1,
      width: 2.2,
      "line-color": "#89bbfe",
      "target-arrow-color": "#89bbfe",
      label: "data(type)",
      "font-size": 10,
      color: "#cae5ff",
      "text-background-color": "#331e36",
      "text-background-opacity": 0.75,
      "text-background-padding": 2 as any,
      "z-index": 15,
    },
  },
];

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [ready, setReady] = useState(false);
  const { isMobile } = useResponsive();

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
        style: cyStylesheet as any,
        minZoom: 0.05,
        maxZoom: 3,
        userPanningEnabled: true,
        userZoomingEnabled: true,
        autoungrabify: false,
        boxSelectionEnabled: false,
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

  /* update elements */
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
      await new Promise((r) => setTimeout(r, 0));
      if (cancelled) return;

      cy.elements().remove();

      // Smaller chunks + explicit rAF yields keep the main thread
      // responsive during add for graphs with tens of thousands of
      // nodes. Without this, the tab appears frozen for several seconds
      // even though grid layout itself is cheap.
      const CHUNK = 1500;
      const yieldFrame = () =>
        new Promise<void>((r) =>
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame(() => r())
            : setTimeout(() => r(), 0),
        );
      for (let i = 0; i < mapped.length; i += CHUNK) {
        if (cancelled) return;
        cy.batch(() => cy.add(mapped.slice(i, i + CHUNK)));
        if (i + CHUNK < mapped.length) {
          await yieldFrame();
        }
      }
      if (cancelled) return;

      const childNodeCount = filtered.nodes.length;
      // Use cytoscape's built-in `grid` layout for every graph size —
      // it handles compound parents, produces predictable multi-row
      // spacing, and is O(N) so it never blocks the main thread. Rows
      // and cols are derived from the viewport aspect ratio so large
      // graphs fill the canvas roughly isotropically instead of
      // producing a 50-wide stripe.
      const vw = containerRef.current?.clientWidth || 1600;
      const vh = containerRef.current?.clientHeight || 900;
      const aspectPx = Math.max(0.25, vw / vh);
      const cols = Math.max(
        1,
        Math.ceil(Math.sqrt(childNodeCount * aspectPx * (CELL_H / CELL_W))),
      );
      const rows = Math.max(1, Math.ceil(childNodeCount / cols));
      const layout = cy.layout({
        name: "grid",
        fit: true,
        padding: 30,
        avoidOverlap: true,
        avoidOverlapPadding: 10,
        condense: false,
        rows,
        cols,
        animate: false,
        sort: (a: cytoscape.NodeSingular, b: cytoscape.NodeSingular) => {
          const ai = (a.data("gridIndex") as number | undefined) ?? Number.MAX_SAFE_INTEGER;
          const bi = (b.data("gridIndex") as number | undefined) ?? Number.MAX_SAFE_INTEGER;
          return ai - bi;
        },
      } as any);
      layout.one("layoutstop", () => {
        finalizeLoad();
        setLoading(false);
      });
      layout.run();
    })();

    return () => { cancelled = true; };
  }, [elementsWithParents, filtered.nodes.length, ready, isMobile, finalizeLoad]);

  /* selection highlight + spotlight zoom
   *
   * When a node is selected (from a graph click, the top-nav search
   * dropdown, or a deep-link), we:
   *   1. `select()` the node so cytoscape paints its selected style
   *   2. Mark the node + its 1-hop neighborhood with .spotlight-focus;
   *      everything else gets .spotlight-dim — CSS tokens pick these up
   *      and apply opacity/blur via cytoscape styles below.
   *   3. Animate the viewport to center on the neighborhood's bounding
   *      box with a comfortable zoom padding. */
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.elements().removeClass("spotlight-focus spotlight-dim");
    cy.nodes().unselect();

    if (!selectedNodeId) return;

    const node = cy.getElementById(selectedNodeId);
    if (!node.length) return;
    node.select();

    const neighborhood = node.closedNeighborhood();
    neighborhood.addClass("spotlight-focus");
    cy.elements().difference(neighborhood).addClass("spotlight-dim");

    cy.stop(true, true);
    cy.animate(
      {
        fit: { eles: neighborhood, padding: 80 },
      },
      { duration: 400, easing: "ease-out" },
    );
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
      if (e.key === "Escape") setSelectedNodeId(null);
      if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey)
        setLayoutName(layoutName === "cose" ? "breadthfirst" : "cose");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutName, setLayoutName, setSelectedNodeId]);

  return (
    <div className="graph-canvas">
      <div className="graph-canvas-inner">
        <div ref={containerRef} className="graph-canvas-container" />
        {loading && (
          <div className="graph-loading-overlay">
            <span className="graph-loading-text">initialising graph engine...</span>
          </div>
        )}
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
        <button onClick={() => cyRef.current?.fit(undefined, 48)} title="Fit">&#x2298;</button>
        <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.1)} title="Zoom in">+</button>
        <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.9)} title="Zoom out">&minus;</button>
        <button onClick={() => setLayoutName(layoutName === "cose" ? "breadthfirst" : "cose")} title="Relayout">L</button>
      </div>
    </div>
  );
}
