import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, LayoutGrid, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useThemeStore } from "@/stores/theme";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { loadCytoscape } from "@/lib/cytoscapeLoader";
import { useSources } from "@/hooks/useSources";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";

const MAX_LABEL_CHARS = 32;
// NODE_W/NODE_H mirror the base `node` selector's width/height in the
// cytoscape stylesheet. If you bump those there, bump these here too —
// the grid layout spaces cells with these dimensions.
const NODE_W = 220;
const NODE_H = 52;
const GAP_X = 20;
const GAP_Y = 12;
const CELL_W = NODE_W + GAP_X;
const CELL_H = NODE_H + GAP_Y;

type GraphTheme = "light" | "dark";

/* Glass-morphism palette.
 *
 * Nodes are neutral translucent glass panes — same fill and text color
 * per theme — and are distinguished by their border color, which encodes
 * the node's semantic type. That keeps the canvas from drowning in
 * fills yet still reading type at a glance. Edges follow the same
 * pattern: muted neutral default line, per-type accent on meaningful
 * relationships.
 *
 * Dark theme uses brighter hues so borders pop against shadow-grey;
 * light theme uses deeper hues so borders have enough contrast to be
 * read against linen. Canvas background and grid lines come from
 * theme.css (--graph-canvas-bg, --graph-grid-line) and are not set
 * inside Cytoscape — they belong to the .graph-canvas-container div.
 */
interface GraphPalette {
  // Neutral node glass
  nodeFill: string;             // translucent default — same for every type
  nodeBorder: string;           // fallback border when type is unknown
  nodeText: string;
  nodeTextOutline: string;      // faint halo for label readability against grid
  nodeSelectedBorder: string;
  nodeSelectedFill: string;

  // Edges
  edgeLine: string;
  edgeArrow: string;
  edgeLabelText: string;
  edgeLabelBg: string;

  // Spotlight / compound parents
  spotlightFocusBorder: string;
  spotlightDimText: string;
  sourceParentBorder: string;
  sourceParentText: string;

  // Per-type borders (shiny, full-opacity)
  typeService: string;
  typeSource: string;
  typeDatabase: string;
  typeCache: string;
  typeData: string;
  typePolicy: string;
  typeAdr: string;
  typeIncident: string;
  typeViolation: string;
  typeExternal: string;
  typeConfig: string;
  typeScript: string;
  typeDoc: string;
  typeAsset: string;

  // Per-type edge lines
  edgeDepends: string;
  edgeDependsArrow: string;
  edgeViolation: string;
  edgeEnforces: string;
  edgeEnforcesArrow: string;
  edgeWhy: string;
  edgeWhyArrow: string;
  edgeWhyLabel: string;
  edgeDrift: string;
}

const DARK: GraphPalette = {
  // Glass on shadow-grey: translucent linen shows the grid through
  nodeFill:          "rgba(239, 230, 221, 0.14)",
  nodeBorder:        "rgba(239, 230, 221, 0.32)",
  nodeText:          "#efe6dd",
  nodeTextOutline:   "rgba(35, 31, 32, 0.85)",
  nodeSelectedBorder:"#f3dfa2",
  nodeSelectedFill:  "rgba(111, 181, 167, 0.22)",

  edgeLine:          "rgba(239, 230, 221, 0.22)",
  edgeArrow:         "rgba(239, 230, 221, 0.4)",
  edgeLabelText:     "#efe6dd",
  edgeLabelBg:       "rgba(35, 31, 32, 0.9)",

  spotlightFocusBorder: "#f3dfa2",
  spotlightDimText:     "rgba(239, 230, 221, 0.7)",
  sourceParentBorder:   "rgba(216, 138, 115, 0.4)",
  sourceParentText:     "rgba(239, 230, 221, 0.55)",

  // Lifted verdigris/clay hues against shadow-grey
  typeService:   "#6fb5a7",
  typeSource:    "#6fb5a7",
  typeDatabase:  "#d88a73",
  typeCache:     "#e8aa99",
  typeData:      "#d88a73",
  typePolicy:    "#f3dfa2",
  typeAdr:       "#e6c866",
  typeIncident:  "#e6706b",
  typeViolation: "#e6706b",
  typeExternal:  "#a19890",
  typeConfig:    "#c5b8a8",
  typeScript:    "#e6c866",
  typeDoc:       "#d88a73",
  typeAsset:     "#a19890",

  edgeDepends:       "rgba(111, 181, 167, 0.58)",
  edgeDependsArrow:  "rgba(111, 181, 167, 0.75)",
  edgeViolation:     "#e6706b",
  edgeEnforces:      "rgba(216, 138, 115, 0.58)",
  edgeEnforcesArrow: "rgba(216, 138, 115, 0.75)",
  edgeWhy:           "rgba(243, 223, 162, 0.62)",
  edgeWhyArrow:      "rgba(243, 223, 162, 0.78)",
  edgeWhyLabel:      "#f3dfa2",
  edgeDrift:         "rgba(230, 112, 107, 0.4)",
};

const LIGHT: GraphPalette = {
  // Glass on linen: near-white translucent shows the grid through
  nodeFill:          "rgba(255, 255, 255, 0.62)",
  nodeBorder:        "rgba(35, 31, 32, 0.28)",
  nodeText:          "#231f20",
  nodeTextOutline:   "rgba(255, 253, 250, 0.9)",
  nodeSelectedBorder:"#1c554e",
  nodeSelectedFill:  "rgba(47, 122, 111, 0.22)",

  edgeLine:          "rgba(35, 31, 32, 0.3)",
  edgeArrow:         "rgba(35, 31, 32, 0.45)",
  edgeLabelText:     "#231f20",
  edgeLabelBg:       "rgba(255, 253, 250, 0.95)",

  spotlightFocusBorder: "#2f7a6f",
  spotlightDimText:     "rgba(35, 31, 32, 0.55)",
  sourceParentBorder:   "rgba(47, 122, 111, 0.45)",
  sourceParentText:     "rgba(35, 31, 32, 0.55)",

  // Deeper verdigris/clay hues against linen
  typeService:   "#1c554e",
  typeSource:    "#1c554e",
  typeDatabase:  "#a64a35",
  typeCache:     "#7a3728",
  typeData:      "#a64a35",
  typePolicy:    "#c59e3a",
  typeAdr:       "#b8882a",
  typeIncident:  "#a43b3b",
  typeViolation: "#a43b3b",
  typeExternal:  "#6b6866",
  typeConfig:    "#8a7f74",
  typeScript:    "#b8882a",
  typeDoc:       "#7a3728",
  typeAsset:     "#6b6866",

  edgeDepends:       "rgba(28, 85, 78, 0.55)",
  edgeDependsArrow:  "rgba(28, 85, 78, 0.72)",
  edgeViolation:     "#a43b3b",
  edgeEnforces:      "rgba(116, 48, 31, 0.55)",
  edgeEnforcesArrow: "rgba(116, 48, 31, 0.72)",
  edgeWhy:           "rgba(184, 136, 42, 0.6)",
  edgeWhyArrow:      "rgba(184, 136, 42, 0.75)",
  edgeWhyLabel:      "#b8882a",
  edgeDrift:         "rgba(164, 59, 59, 0.32)",
};

function buildCyStylesheet(theme: GraphTheme) {
  const t = theme === "light" ? LIGHT : DARK;
  return [
    {
      // Base node: glass pane. Background is a translucent linen / white
      // so the grid reads through every node. Border is the neutral
      // fallback — per-type rules below override it with the type-
      // specific shiny accent.
      selector: "node",
      style: {
        "background-color":     t.nodeFill,
        "background-opacity":   1,
        "border-width":         2,
        "border-color":         t.nodeBorder,
        "border-opacity":       1,
        label:                  "data(label)",
        color:                  t.nodeText,
        "text-outline-color":   t.nodeTextOutline,
        "text-outline-width":   1,
        "text-outline-opacity": 1,
        // Auto-fit the label inside the node box: wrap long filenames onto
        // two lines and shrink the font so it never spills over the border.
        // Sizes scale with label length so short names use the full
        // node width and stay easy to read at zoom-out distances. The
        // 220×52 node box at text-max-width: 204px fits these comfortably.
        "font-size":            ((ele: cytoscape.NodeSingular) => {
          const raw = (ele.data("label") as string | undefined) ?? "";
          const len = raw.length;
          if (len <= 8)  return 18;
          if (len <= 14) return 16;
          if (len <= 22) return 14;
          if (len <= 32) return 12;
          return 11;
        }) as any,
        "font-family":          '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
        "font-weight":          500,
        "text-valign":          "center",
        "text-halign":          "center",
        "text-wrap":            "wrap",
        "text-max-width":       "204px",
        "text-overflow-wrap":   "anywhere",
        "line-height":          1.1,
        width:                  220,
        height:                 52,
        shape:                  "roundrectangle",
        padding:                "8px" as any,
        "z-index":              10,
      },
    },

    // Per-type colored borders. Fill stays the neutral glass; only the
    // border and (for structural types) shape changes.
    { selector: 'node[type="service"]',   style: { "border-color": t.typeService } },
    { selector: 'node[type="source"]',    style: { "border-color": t.typeSource } },
    { selector: 'node[type="database"]',  style: { "border-color": t.typeDatabase,  shape: "barrel" } },
    { selector: 'node[type="cache"]',     style: { "border-color": t.typeCache,     shape: "barrel" } },
    { selector: 'node[type="data"]',      style: { "border-color": t.typeData } },
    { selector: 'node[type="policy"]',    style: { "border-color": t.typePolicy,    "border-width": 2.5, shape: "diamond", width: 110, height: 48 } },
    { selector: 'node[type="adr"]',       style: { "border-color": t.typeAdr,       shape: "roundrectangle", width: 90, height: 34, "font-size": 10 } },
    { selector: 'node[type="incident"]',  style: { "border-color": t.typeIncident,  "border-width": 2.5, shape: "roundrectangle", width: 90, height: 34, "font-size": 10 } },
    { selector: 'node[type="external"]',  style: { "border-color": t.typeExternal,  shape: "roundrectangle", width: 100, height: 34, "font-size": 10 } },
    { selector: 'node[type="config"]',    style: { "border-color": t.typeConfig } },
    { selector: 'node[type="script"]',    style: { "border-color": t.typeScript } },
    { selector: 'node[type="doc"]',       style: { "border-color": t.typeDoc } },
    { selector: 'node[type="asset"]',     style: { "border-color": t.typeAsset } },
    { selector: 'node[status="violation"]',
      style: { "border-color": t.typeViolation, "border-width": 2.5 } },

    // Base edge: muted neutral line. z-index 1 keeps every default edge
    // BEHIND every node (which has z-index 10) — only spotlight-focus
    // edges (the ones touching the currently-selected node, set to 15
    // below) climb above non-focused nodes so the user can trace the
    // selection's neighborhood without occluding everything else.
    {
      selector: "edge",
      style: {
        width:                      1.2,
        "line-color":               t.edgeLine,
        "target-arrow-color":       t.edgeArrow,
        "target-arrow-shape":       "triangle",
        "curve-style":              "bezier",
        "arrow-scale":              0.85,
        label:                      "",
        "font-size":                9,
        color:                      t.edgeLabelText,
        "text-background-color":    t.edgeLabelBg,
        "text-background-opacity":  0.95,
        "text-background-padding":  "2px" as any,
        "z-index":                  1,
        "z-compound-depth":         "auto" as any,
      },
    },
    { selector: 'edge[type="depends"]',
      style: { "line-color": t.edgeDepends, "target-arrow-color": t.edgeDependsArrow } },
    { selector: 'edge[type="depends_on"]',
      style: { "line-color": t.edgeDepends, "target-arrow-color": t.edgeDependsArrow } },
    { selector: 'edge[type="violation"]',
      style: { "line-color": t.edgeViolation, "target-arrow-color": t.edgeViolation, width: 2.2, "line-style": "dashed", "line-dash-pattern": [6, 3] as any, label: "data(label)", color: t.edgeViolation, "font-size": 9 } },
    { selector: 'edge[type="enforces"]',
      style: { "line-color": t.edgeEnforces, "target-arrow-color": t.edgeEnforcesArrow, "line-style": "dotted", width: 1.5 } },
    { selector: 'edge[type="why"]',
      style: { "line-color": t.edgeWhy, "target-arrow-color": t.edgeWhyArrow, "line-style": "dashed", "line-dash-pattern": [4, 4] as any, width: 1.5, label: "data(label)", color: t.edgeWhyLabel, "font-size": 9 } },
    { selector: 'edge[type="drift"]',
      style: { "line-color": t.edgeDrift, "target-arrow-color": t.edgeDrift, "line-style": "dashed" } },

    { selector: ":selected",
      style: { "border-width": 3, "border-color": t.nodeSelectedBorder, "background-color": t.nodeSelectedFill } },

    // Source-parent compound: dashed frame, no fill.
    {
      selector: "node[?isSourceParent]",
      style: {
        shape:                  "roundrectangle",
        "background-opacity":   0,
        "border-style":         "dashed" as any,
        "border-width":         1,
        "border-color":         t.sourceParentBorder,
        label:                  "data(label)",
        "text-valign":          "top",
        "text-halign":          "left",
        "text-outline-width":   0,
        "font-size":            10,
        "font-weight":          500,
        color:                  t.sourceParentText,
        "text-margin-y":        -4 as any,
        padding:                "24px" as any,
      },
    },

    { selector: ".carousel-hidden", style: { display: "none" } },
    { selector: ".spotlight-dim", style: { opacity: 0.28 } },
    { selector: "node.spotlight-dim",
      style: { "text-opacity": 1, color: t.spotlightDimText } },
    { selector: "edge.spotlight-dim", style: { "text-opacity": 0.4 } },
    { selector: "node.spotlight-focus",
      style: { opacity: 1, "text-opacity": 1 } },
    { selector: "node.spotlight-focus:childless",
      style: { "font-size": 18, "border-width": 3, "border-color": t.spotlightFocusBorder, "z-index": 20 } },
    {
      selector: "edge.spotlight-focus",
      style: {
        opacity:                  1,
        "text-opacity":           1,
        width:                    2.4,
        "line-color":             t.spotlightFocusBorder,
        "target-arrow-color":     t.spotlightFocusBorder,
        label:                    "data(type)",
        "font-size":              10,
        color:                    t.edgeLabelText,
        "text-background-color":  t.edgeLabelBg,
        "text-background-opacity":0.85,
        "text-background-padding": 2 as any,
        "z-index":                15,
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
  const visibleSubset = useGraphStore((s) => s.visibleSubset);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setZoom = useGraphStore((s) => s.setZoom);
  const setLayoutName = useGraphStore((s) => s.setLayoutName);
  const setPan = useGraphStore((s) => s.setPan);
  const finalizeLoad = useGraphStore((s) => s.finalizeLoad);
  const pendingZoomNodeId = useGraphStore((s) => s.pendingZoomNodeId);
  const clearPendingZoom = useGraphStore((s) => s.clearPendingZoom);

  const openModal = useUIStore((s) => s.openModal);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (selectedNodeId == null) return;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 800);
    return () => clearTimeout(t);
  }, [selectedNodeId]);

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
  }, [setSelectedNodeId, setZoom, setPan]);

  /* Re-apply the theme-keyed stylesheet whenever the global theme
   * changes. Cytoscape doesn't observe CSS variables, so we rebuild the
   * stylesheet from the current theme tokens and push it in. */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready) return;
    cy.style().fromJson(buildCyStylesheet(theme)).update();
  }, [theme, ready]);

  /* Keep the container's CSS grid background in sync with the Cytoscape
   * viewport. The grid lives on .graph-canvas-container via theme.css
   * tokens and is fixed in CSS pixels; without this effect the grid
   * stays put while nodes pan and zoom, which defeats its purpose as a
   * size reference. On every zoom/pan we update background-size (so
   * grid squares scale with nodes) and background-position (so the
   * grid travels with the pan). */
  useEffect(() => {
    const cy = cyRef.current;
    const container = containerRef.current;
    if (!cy || !container || !ready) return;
    const BASE_GRID_PX = 50;

    const syncGrid = () => {
      const z = cy.zoom();
      const p = cy.pan();
      const size = BASE_GRID_PX * z;
      container.style.backgroundSize = `${size}px ${size}px`;
      container.style.backgroundPosition = `${p.x}px ${p.y}px`;
    };

    syncGrid();
    cy.on("zoom pan", syncGrid);
    return () => { cy.off("zoom pan", syncGrid); };
  }, [ready]);

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

      // If the container is currently hidden (e.g., user is on the
      // Sources view when the snapshot is loaded), defer layout to the
      // ResizeObserver — it re-runs layout the moment the canvas
      // becomes visible. Without this deferral, `fit: true` pins nodes
      // to a ~0 viewport and the user has to refresh to see anything.
      // We still clear the load timer so the store's lastLoadMs doesn't
      // get stuck in "pending" forever.
      const vwReal = containerRef.current?.clientWidth ?? 0;
      const vhReal = containerRef.current?.clientHeight ?? 0;
      if (vwReal === 0 || vhReal === 0) {
        finalizeLoad();
        setLoading(false);
        return;
      }

      const childNodeCount = filtered.nodes.length;
      // Use cytoscape's built-in `grid` layout for every graph size —
      // it handles compound parents, produces predictable multi-row
      // spacing, and is O(N) so it never blocks the main thread. Rows
      // and cols are derived from the viewport aspect ratio so large
      // graphs fill the canvas roughly isotropically instead of
      // producing a 50-wide stripe.
      const vw = vwReal;
      const vh = vhReal;
      const aspectPx = Math.max(0.25, vw / vh);
      const cols = Math.max(
        1,
        Math.ceil(Math.sqrt(childNodeCount * aspectPx * (CELL_H / CELL_W))),
      );
      const rows = Math.max(1, Math.ceil(childNodeCount / cols));
      // Cytoscape caches the container's viewport size internally; when
      // the container was 0x0 at init (e.g. Graph view hidden while the
      // user loaded a snapshot on Sources), cy still thinks it's 0x0
      // until we poke it. Without this call, `fit:true` computes zoom
      // against a 0x0 viewport and pins nodes to the top-left corner.
      cy.resize();
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

  const runRelayout = useCallback(() => {
    const cy = cyRef.current;
    const container = containerRef.current;
    if (!cy || !container) return;
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
    // Sync cytoscape's internal viewport with the live container size
    // before layout runs — otherwise `fit:true` uses stale dimensions
    // from the last resize (zero if the graph was hidden at init).
    cy.resize();
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
    } as cytoscape.LayoutOptions).run();
  }, []);

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
    const container = containerRef.current;
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;

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
        runRelayout();
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
  }, [ready, runRelayout]);

  /* Carousel-driven visibility filter.
   *
   * The carousel scopes the canvas to one Leiden community per slide.
   * When `visibleSubset` is null every element is shown (slide 0 / full
   * graph). When it is a non-empty Set we hide every node NOT in the set
   * (plus the edges that dangle as a result) and re-fit the camera on
   * the remaining subgraph. Compound parents stay visible as long as at
   * least one of their children is — hiding an empty parent would leave
   * an empty source-wrapper on screen. */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready) return;
    cy.batch(() => {
      cy.elements().removeClass("carousel-hidden");
      if (!visibleSubset) return;
      cy.nodes().forEach((n) => {
        if (n.data("isSourceParent")) return;
        const id = n.id();
        if (!visibleSubset.has(id)) n.addClass("carousel-hidden");
      });
      cy.edges().forEach((e) => {
        const src = e.source();
        const tgt = e.target();
        if (src.hasClass("carousel-hidden") || tgt.hasClass("carousel-hidden")) {
          e.addClass("carousel-hidden");
        }
      });
      cy.nodes().forEach((n) => {
        if (!n.data("isSourceParent")) return;
        let anyVisible = false;
        n.children().forEach((c) => {
          if (!c.hasClass("carousel-hidden")) anyVisible = true;
        });
        if (!anyVisible) n.addClass("carousel-hidden");
      });
    });
    const visible = cy.elements().not(".carousel-hidden");
    if (visible.length > 0) {
      cy.animate(
        { fit: { eles: visible, padding: 40 } },
        { duration: 260, easing: "ease-out" },
      );
    }
  }, [visibleSubset, ready]);

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

  /* Search-driven focus zoom.
   *
   * The Ctrl+K SearchModal sets ``pendingZoomNodeId`` via
   * ``useGraphStore.focusNode``. The selection effect above handles the
   * spotlight + neighborhood fit when ``selectedNodeId`` *changes*, but
   * if the user picks the same node twice in a row (or arrives here via
   * a slide switch where the canvas just remounted) we still want to
   * re-fit on the node. This effect runs each time ``pendingZoomNodeId``
   * is non-null and clears the flag immediately so the next click
   * re-triggers it.
   */
  useEffect(() => {
    if (!ready || !cyRef.current || !pendingZoomNodeId) return;
    const cy = cyRef.current;
    const node = cy.getElementById(pendingZoomNodeId);
    if (node && node.length > 0) {
      cy.stop(true, true);
      cy.animate(
        { fit: { eles: node, padding: 100 } },
        { duration: 320, easing: "ease-out" },
      );
    }
    clearPendingZoom();
  }, [pendingZoomNodeId, clearPendingZoom, ready]);

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
      const cy = cyRef.current;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "0") {
          e.preventDefault();
          if (!cy) return;
          cy.resize();
          cy.fit(cy.elements(), 48);
        } else if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          if (!cy) return;
          cy.zoom(cy.zoom() * 1.1);
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          if (!cy) return;
          cy.zoom(cy.zoom() * 0.9);
        }
      }
      if (e.key === "Escape") setSelectedNodeId(null);
      if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey) {
        setLayoutName(layoutName === "cose" ? "breadthfirst" : "cose");
        runRelayout();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layoutName, setLayoutName, setSelectedNodeId, runRelayout]);

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
        <button
          type="button"
          className={`graph-toolbar-info${pulsing ? " is-pulsing" : ""}`}
          disabled={selectedNodeId == null}
          title={selectedNodeId == null ? "Click a node to enable" : "Show node details"}
          aria-label="Show node details"
          onClick={() => openModal("nodeDetail")}
        >
          <Info size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => {
            const cy = cyRef.current;
            if (!cy) return;
            cy.resize();
            cy.fit(cy.elements(), 48);
          }}
          title="Fit"
          aria-label="Fit"
        >
          <Maximize2 size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => {
            const cy = cyRef.current;
            if (!cy) return;
            cy.zoom(cy.zoom() * 1.1);
          }}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => {
            const cy = cyRef.current;
            if (!cy) return;
            cy.zoom(cy.zoom() * 0.9);
          }}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => {
            setLayoutName(layoutName === "cose" ? "breadthfirst" : "cose");
            runRelayout();
          }}
          title="Relayout"
          aria-label="Relayout"
        >
          <LayoutGrid size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
