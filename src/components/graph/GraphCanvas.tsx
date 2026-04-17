import { useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "@/stores/graph";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
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

type GraphTheme = "light" | "dark";

interface GraphPalette {
  nodeFill: string;
  nodeBorder: string;
  nodeText: string;
  nodeSelectedFill: string;
  nodeSelectedBorder: string;
  edgeLine: string;
  edgeArrow: string;
  edgeLabelText: string;
  edgeLabelBg: string;
  spotlightFocusBorder: string;
  spotlightDimText: string;
  sourceParentBorder: string;
  sourceParentText: string;
  typeFillCool: string;   // service/source (cool blue tint)
  typeFillGreen: string;  // database/cache/data
  typeFillWarm: string;   // adr/script
  typeFillDanger: string; // incident/violation
  typeFillPolicy: string; // policy (purple)
  typeFillNeutral: string; // external/config/doc/asset
}

const DARK: GraphPalette = {
  nodeFill: "#241327",
  nodeBorder: "rgba(202,229,255,0.18)",
  nodeText: "#cae5ff",
  nodeSelectedFill: "#1d2a44",
  nodeSelectedBorder: "#ffffff",
  edgeLine: "rgba(202,229,255,0.10)",
  edgeArrow: "rgba(202,229,255,0.18)",
  edgeLabelText: "#cae5ff",
  edgeLabelBg: "#241327",
  spotlightFocusBorder: "#89bbfe",
  spotlightDimText: "#000000",
  sourceParentBorder: "rgba(137,187,254,0.28)",
  sourceParentText: "rgba(202,229,255,0.55)",
  typeFillCool: "#1d1e3a",
  typeFillGreen: "#14241b",
  typeFillWarm: "#2a1f14",
  typeFillDanger: "#2a1414",
  typeFillPolicy: "#251838",
  typeFillNeutral: "#1a1a22",
};

const LIGHT: GraphPalette = {
  nodeFill: "rgba(255,255,255,0.88)",
  nodeBorder: "rgba(51,30,54,0.22)",
  nodeText: "#331e36",
  nodeSelectedFill: "rgba(137,187,254,0.28)",
  nodeSelectedBorder: "#331e36",
  edgeLine: "rgba(51,30,54,0.18)",
  edgeArrow: "rgba(51,30,54,0.28)",
  edgeLabelText: "#331e36",
  edgeLabelBg: "rgba(255,255,255,0.92)",
  spotlightFocusBorder: "#6f8ab7",
  spotlightDimText: "rgba(51,30,54,0.6)",
  sourceParentBorder: "rgba(111,138,183,0.4)",
  sourceParentText: "rgba(51,30,54,0.6)",
  typeFillCool: "rgba(137,187,254,0.18)",
  typeFillGreen: "rgba(139,188,156,0.18)",
  typeFillWarm: "rgba(216,154,91,0.16)",
  typeFillDanger: "rgba(192,96,96,0.15)",
  typeFillPolicy: "rgba(157,123,204,0.15)",
  typeFillNeutral: "rgba(97,93,108,0.1)",
};

function buildCyStylesheet(theme: GraphTheme) {
  const t = theme === "light" ? LIGHT : DARK;
  return [
    {
      selector: "node",
      style: {
        "background-color": t.nodeFill,
        "border-width": 1.5,
        "border-color": t.nodeBorder,
        label: "data(label)",
        color: t.nodeText,
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
    { selector: 'node[type="service"]',
      style: { "background-color": t.typeFillCool, "border-color": "#6f8ab7", "border-width": 1.5 } },
    { selector: 'node[type="database"]',
      style: { "background-color": t.typeFillGreen, "border-color": "#6b9a70", "border-width": 1.5, shape: "barrel" } },
    { selector: 'node[type="cache"]',
      style: { "background-color": t.typeFillGreen, "border-color": "#5a9578", shape: "barrel" } },
    { selector: 'node[type="policy"]',
      style: { "background-color": t.typeFillPolicy, "border-color": "#9d7bcc", "border-width": 2, shape: "diamond", width: 110, height: 48 } },
    { selector: 'node[type="adr"]',
      style: { "background-color": t.typeFillWarm, "border-color": "#a66a1f", shape: "roundrectangle", width: 80, height: 32, "font-size": 10 } },
    { selector: 'node[type="incident"]',
      style: { "background-color": t.typeFillDanger, "border-color": "#c53030", shape: "roundrectangle", width: 80, height: 32, "font-size": 10 } },
    { selector: 'node[type="external"]',
      style: { "background-color": t.typeFillNeutral, "border-color": "#615d6c", shape: "roundrectangle", width: 90, height: 32, "font-size": 10 } },
    { selector: 'node[type="source"]',
      style: { "background-color": t.typeFillCool, "border-color": "#6f8ab7", "border-width": 1.5 } },
    { selector: 'node[type="config"]',
      style: { "background-color": t.typeFillNeutral, "border-color": "#615d6c" } },
    { selector: 'node[type="script"]',
      style: { "background-color": t.typeFillWarm, "border-color": "#a66a1f" } },
    { selector: 'node[type="doc"]',
      style: { "background-color": t.typeFillNeutral, "border-color": "#615d6c" } },
    { selector: 'node[type="data"]',
      style: { "background-color": t.typeFillGreen, "border-color": "#6b9a70" } },
    { selector: 'node[type="asset"]',
      style: { "background-color": t.typeFillNeutral, "border-color": "#615d6c" } },
    { selector: 'node[status="violation"]',
      style: { "background-color": t.typeFillDanger, "border-color": "#ef4444", "border-width": 2 } },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": t.edgeLine,
        "target-arrow-color": t.edgeArrow,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
        label: "",
        "font-size": 9,
        color: t.edgeLabelText,
        "text-background-color": t.edgeLabelBg,
        "text-background-opacity": 0.92,
        "text-background-padding": "2px" as any,
      },
    },
    { selector: 'edge[type="depends"]',
      style: { "line-color": "rgba(137,187,254,0.32)", "target-arrow-color": "rgba(137,187,254,0.45)" } },
    { selector: 'edge[type="depends_on"]',
      style: { "line-color": "rgba(137,187,254,0.32)", "target-arrow-color": "rgba(137,187,254,0.45)" } },
    { selector: 'edge[type="violation"]',
      style: { "line-color": "#ef4444", "target-arrow-color": "#ef4444", width: 2, "line-style": "dashed", "line-dash-pattern": [6, 3] as any, label: "data(label)", color: "#ef4444", "font-size": 9 } },
    { selector: 'edge[type="enforces"]',
      style: { "line-color": "rgba(157,123,204,0.55)", "target-arrow-color": "rgba(157,123,204,0.65)", "line-style": "dotted", width: 1.5 } },
    { selector: 'edge[type="why"]',
      style: { "line-color": "rgba(245,158,11,0.55)", "target-arrow-color": "rgba(245,158,11,0.65)", "line-style": "dashed", "line-dash-pattern": [4, 4] as any, width: 1.5, label: "data(label)", color: "#f59e0b", "font-size": 8 } },
    { selector: 'edge[type="drift"]',
      style: { "line-color": "rgba(239,68,68,0.32)", "target-arrow-color": "rgba(239,68,68,0.32)", "line-style": "dashed" } },
    { selector: ":selected",
      style: { "border-width": 3, "border-color": t.nodeSelectedBorder, "background-color": t.nodeSelectedFill } },
    {
      selector: "node[?isSourceParent]",
      style: {
        shape: "roundrectangle",
        "background-opacity": 0,
        "border-style": "dashed" as any,
        "border-width": 1,
        "border-color": t.sourceParentBorder,
        label: "data(label)",
        "text-valign": "top",
        "text-halign": "left",
        "font-size": 10,
        color: t.sourceParentText,
        "text-margin-y": -4 as any,
        padding: "24px" as any,
      },
    },
    { selector: ".spotlight-dim", style: { opacity: 0.28 } },
    { selector: "node.spotlight-dim",
      style: { "text-opacity": 1, color: t.spotlightDimText } },
    { selector: "edge.spotlight-dim", style: { "text-opacity": 0.4 } },
    { selector: "node.spotlight-focus",
      style: { opacity: 1, "text-opacity": 1 } },
    { selector: "node.spotlight-focus:childless",
      style: { "font-size": 13, "border-width": 2, "border-color": t.spotlightFocusBorder, "z-index": 20 } },
    {
      selector: "edge.spotlight-focus",
      style: {
        opacity: 1, "text-opacity": 1, width: 2.2,
        "line-color": t.spotlightFocusBorder,
        "target-arrow-color": t.spotlightFocusBorder,
        label: "data(type)", "font-size": 10,
        color: t.edgeLabelText,
        "text-background-color": t.edgeLabelBg,
        "text-background-opacity": 0.75,
        "text-background-padding": 2 as any,
        "z-index": 15,
      },
    },
  ];
}

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

  const theme = useThemeStore((s) => s.theme);

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
        style: buildCyStylesheet(theme) as any,
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
    // `theme` is intentionally excluded — it's only read on initial mount.
    // Subsequent theme changes are applied by the effect below, which avoids
    // tearing down and rebuilding the Cytoscape instance (which would wipe
    // the graph and be expensive).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSelectedNodeId, setZoom, setPan, openModal]);

  /* Re-apply the theme-keyed stylesheet whenever the global theme
   * changes. Cytoscape doesn't observe CSS variables, so we rebuild the
   * stylesheet from the current theme tokens and push it in. */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready) return;
    cy.style().fromJson(buildCyStylesheet(theme)).update();
  }, [theme, ready]);

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
