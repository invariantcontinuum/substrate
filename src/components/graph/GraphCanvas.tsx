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
    // Base node: the brainrot graph aesthetic — a dark "sunken panel"
    // fill (#241327, just darker than the Midnight Violet canvas
    // #331e36) with a subtle Pale-Sky-tinted border and bright Pale
    // Sky text. The colored borders below give each type a semantic
    // accent without relying on high-contrast fills, keeping the
    // canvas feeling atmospheric rather than busy.
    selector: "node",
    style: {
      "background-color": "#241327",
      "border-width": 1.5,
      "border-color": "rgba(202,229,255,0.18)",
      label: "data(label)",
      color: "#cae5ff",
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
      "background-color": "#1d1e3a",
      "border-color": "#6f8ab7",
      "border-width": 1.5,
    },
  },
  {
    selector: 'node[type="database"]',
    style: {
      "background-color": "#14241b",
      "border-color": "#6b9a70",
      "border-width": 1.5,
      shape: "barrel",
    },
  },
  {
    selector: 'node[type="cache"]',
    style: {
      "background-color": "#14241b",
      "border-color": "#5a9578",
      shape: "barrel",
    },
  },
  {
    selector: 'node[type="policy"]',
    style: {
      "background-color": "#251838",
      "border-color": "#9d7bcc",
      "border-width": 2,
      shape: "diamond",
      width: 110,
      height: 48,
    },
  },
  {
    selector: 'node[type="adr"]',
    style: {
      "background-color": "#2a1f14",
      "border-color": "#a66a1f",
      shape: "roundrectangle",
      width: 80,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: 'node[type="incident"]',
    style: {
      "background-color": "#2a1414",
      "border-color": "#c53030",
      shape: "roundrectangle",
      width: 80,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: 'node[type="external"]',
    style: {
      "background-color": "#1a1a22",
      "border-color": "#615d6c",
      shape: "roundrectangle",
      width: 90,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: 'node[type="source"]',
    style: {
      "background-color": "#1d2a44",
      "border-color": "#6f8ab7",
      "border-width": 1.5,
    },
  },
  {
    selector: 'node[type="config"]',
    style: {
      "background-color": "#1a1a22",
      "border-color": "#615d6c",
    },
  },
  {
    selector: 'node[type="script"]',
    style: {
      "background-color": "#2a1f14",
      "border-color": "#a66a1f",
    },
  },
  {
    selector: 'node[type="doc"]',
    style: {
      "background-color": "#1a1a22",
      "border-color": "#615d6c",
    },
  },
  {
    selector: 'node[type="data"]',
    style: {
      "background-color": "#14241b",
      "border-color": "#6b9a70",
    },
  },
  {
    selector: 'node[type="asset"]',
    style: {
      "background-color": "#1a1a22",
      "border-color": "#615d6c",
    },
  },
  {
    selector: 'node[status="violation"]',
    style: {
      "background-color": "#2a1414",
      "border-color": "#ef4444",
      "border-width": 2,
    },
  },
  {
    // Edges borrow brainrot's semantic palette: muted whites for the
    // default, brighter/denser colours for edges the user should
    // notice (violation, why). Arrows stay soft so the overall canvas
    // reads as a web rather than a bar chart.
    selector: "edge",
    style: {
      width: 1,
      "line-color": "rgba(202,229,255,0.10)",
      "target-arrow-color": "rgba(202,229,255,0.18)",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "arrow-scale": 0.8,
      label: "",
      "font-size": 9,
      color: "#cae5ff",
      "text-background-color": "#241327",
      "text-background-opacity": 0.92,
      "text-background-padding": "2px" as any,
    },
  },
  {
    selector: 'edge[type="depends"]',
    style: {
      "line-color": "rgba(137,187,254,0.32)",
      "target-arrow-color": "rgba(137,187,254,0.45)",
    },
  },
  {
    selector: 'edge[type="depends_on"]',
    style: {
      "line-color": "rgba(137,187,254,0.32)",
      "target-arrow-color": "rgba(137,187,254,0.45)",
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
      "line-color": "rgba(157,123,204,0.55)",
      "target-arrow-color": "rgba(157,123,204,0.65)",
      "line-style": "dotted",
      width: 1.5,
    },
  },
  {
    selector: 'edge[type="why"]',
    style: {
      "line-color": "rgba(245,158,11,0.55)",
      "target-arrow-color": "rgba(245,158,11,0.65)",
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
      "line-color": "rgba(239,68,68,0.32)",
      "target-arrow-color": "rgba(239,68,68,0.32)",
      "line-style": "dashed",
    },
  },
  {
    selector: ":selected",
    style: {
      "border-width": 3,
      "border-color": "#ffffff",
      "background-color": "#1d2a44",
    },
  },
  {
    selector: "node[?isSourceParent]",
    style: {
      shape: "roundrectangle",
      "background-opacity": 0,
      "border-style": "dashed" as any,
      "border-width": 1,
      "border-color": "rgba(137,187,254,0.28)",
      label: "data(label)",
      "text-valign": "top",
      "text-halign": "left",
      "font-size": 10,
      color: "rgba(202,229,255,0.55)",
      "text-margin-y": -4 as any,
      padding: "24px" as any,
    },
  },
  /* Spotlight — applied when a node is selected from the search
   * dropdown or by click. Focused nodes + their 1-hop neighbors stay
   * fully opaque and gain larger labels; everything else fades.
   *
   * Compound source parents inherit focus (so their children don't get
   * cascaded-dim), but only get `opacity: 1` back — no cyan border /
   * enlarged label override, which would clash with the dashed-frame
   * parent style. */
  {
    // Dim class fades node bodies so the spotlight reads clearly, but
    // leaves labels fully opaque — the user should still be able to
    // orient themselves by the file names in the rest of the graph.
    // Labels on dimmed nodes switch to black for maximum contrast
    // against the greyed-out fills (the default Pale Sky label color
    // is only tuned for the bright focus state).
    selector: ".spotlight-dim",
    style: {
      opacity: 0.28,
    },
  },
  {
    selector: "node.spotlight-dim",
    style: {
      "text-opacity": 1,
      color: "#000000",
    },
  },
  {
    selector: "edge.spotlight-dim",
    style: {
      "text-opacity": 0.4,
    },
  },
  {
    selector: "node.spotlight-focus",
    style: {
      opacity: 1,
      "text-opacity": 1,
    },
  },
  {
    selector: "node.spotlight-focus:childless",
    style: {
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
    // Don't lay out against a hidden/zero-size container — the ResizeObserver
    // effect will rerun once real dimensions arrive. Without this guard the
    // grid layout's `fit:true` fits to a ~0 viewport and nodes cluster in the
    // top-right corner; page refresh hides the bug because the canvas
    // remounts with real dimensions.
    const vw0 = containerRef.current?.clientWidth ?? 0;
    const vh0 = containerRef.current?.clientHeight ?? 0;
    if (vw0 === 0 || vh0 === 0) return;
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

  /* Re-layout on container resize transitions.
   *
   * When a user loads a snapshot from the Sources page, the graph canvas
   * is hidden (activeView === "sources"), so containerRef has zero
   * dimensions and the elements-update effect's layout call was skipped
   * by the guard above. When the user switches back to the Graph view,
   * dimensions arrive via this observer — we re-run the same grid
   * layout so the `fit:true` call sees the real viewport. Also guards
   * against significant window resizes leaving the graph off-axis. */
  useEffect(() => {
    if (!ready || !cyRef.current || !containerRef.current) return;
    const cy = cyRef.current;
    const container = containerRef.current;
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;

    const relayout = () => {
      const childNodeCount = cy.nodes(":childless").length;
      if (childNodeCount === 0) return;
      const vw = container.clientWidth || 1600;
      const vh = container.clientHeight || 900;
      const aspectPx = Math.max(0.25, vw / vh);
      const cols = Math.max(
        1,
        Math.ceil(Math.sqrt(childNodeCount * aspectPx * (CELL_H / CELL_W))),
      );
      const rows = Math.max(1, Math.ceil(childNodeCount / cols));
      cy.layout({
        name: "grid",
        fit: true,
        padding: 30,
        avoidOverlap: true,
        avoidOverlapPadding: 10,
        condense: false,
        rows,
        cols,
        animate: false,
      } as any).run();
    };

    const observer = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      const zeroToNonzero = (lastW === 0 || lastH === 0) && w > 0 && h > 0;
      const deltaW = lastW > 0 ? Math.abs(w - lastW) / lastW : 1;
      const deltaH = lastH > 0 ? Math.abs(h - lastH) / lastH : 1;
      if (zeroToNonzero || deltaW > 0.2 || deltaH > 0.2) {
        lastW = w;
        lastH = h;
        relayout();
      }
    });
    observer.observe(container);

    // Also fire once on mount in case dimensions were already non-zero when
    // ready flipped (e.g., revisiting the graph view with a cached active set).
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      lastW = container.clientWidth;
      lastH = container.clientHeight;
    }

    return () => observer.disconnect();
  }, [ready]);

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

    // Focus = the node, its edges, its 1-hop neighbors, and every
    // ancestor compound (source) parent. Without the ancestors, the
    // dimmed parent's low opacity cascades onto its children and the
    // selected node itself renders faded.
    const neighborhood = node.closedNeighborhood();
    const focus = neighborhood.union(node.parents()).union(neighborhood.nodes().parents());
    focus.addClass("spotlight-focus");
    cy.elements().difference(focus).addClass("spotlight-dim");

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
