import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Info, LayoutGrid, Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useThemeStore } from "@/stores/theme";
import { useUIStore } from "@/stores/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { loadCytoscape } from "@/lib/cytoscapeLoader";
import { useSources } from "@/hooks/useSources";
import { SignalsOverlay } from "./SignalsOverlay";
import { ViolationBadge } from "./ViolationBadge";
import { DynamicLegend } from "./DynamicLegend";
import { useCarouselSlides } from "@/hooks/useCarouselSlides";

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

/* Solid-body palette (Phase 3 restyle).
 *
 * Nodes are SOLID rectangles — navy on light, slate on dark — distinguished
 * by a per-type accent rendered as a 4 px left-edge stripe via a CSS
 * background-image gradient. Labels are flat 18 px / weight 400, white on
 * navy / navy on slate. Edges keep the muted neutral default with per-
 * type accents only on meaningful relationships. Per-type accents are
 * sourced from a single palette block so the legend (styleAdapter.ts)
 * and the canvas stay in sync.
 *
 * Canvas background and grid lines come from theme.css
 * (--graph-canvas-bg, --graph-grid-line) and are not set inside
 * Cytoscape — they belong to the .graph-canvas-container div.
 */
interface GraphPalette {
  // Solid node body
  nodeFill: string;             // solid background per theme
  nodeBorder: string;           // soft 1px outline so the node detaches from its accent stripe
  nodeText: string;             // label color
  nodeTextOutline: string;      // 1px halo for readability over the accent stripe edge
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

  // Per-type accents (used as a 4 px left stripe on each node, and as
  // the legend dot color). Same palette across themes — node body
  // contrast comes from nodeFill above, not the accent.
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

// Per-type accent palette — single source of truth used by both the
// canvas (rendered as the 4 px left stripe inside each node) and the
// legend dot color in DynamicLegend (via styleAdapter.ts). Phase 3.8
// retired the prior earthen palette; the new family is indigo /
// slate / amber from the design system. Keep these and the matching
// constants in styleAdapter.ts in lockstep.
const ACCENT = {
  service:   "#6366f1", // indigo
  source:    "#8b5cf6", // violet
  database:  "#06b6d4", // cyan
  cache:     "#0ea5e9", // sky
  data:      "#3b82f6", // blue
  policy:    "#f59e0b", // amber
  adr:       "#10b981", // emerald
  incident:  "#ef4444", // red
  external:  "#a855f7", // purple
  config:    "#f97316", // orange
  script:    "#22c55e", // green
  doc:       "#64748b", // slate-500
  asset:     "#9ca3af", // gray-400
} as const;

const DARK: GraphPalette = {
  // Solid slate body, navy label
  nodeFill:          "#e6e9f0",
  nodeBorder:        "rgba(15, 23, 42, 0.18)",
  nodeText:          "#0f172a",
  nodeTextOutline:   "rgba(255, 255, 255, 0.65)",
  nodeSelectedBorder:"#c39b54",
  nodeSelectedFill:  "#e6e9f0",

  edgeLine:          "rgba(236, 228, 210, 0.28)",
  edgeArrow:         "rgba(236, 228, 210, 0.5)",
  edgeLabelText:     "#ece4d2",
  edgeLabelBg:       "rgba(14, 22, 34, 0.9)",

  spotlightFocusBorder: "#c39b54",
  spotlightDimText:     "rgba(236, 228, 210, 0.7)",
  sourceParentBorder:   "rgba(195, 155, 84, 0.45)",
  sourceParentText:     "rgba(236, 228, 210, 0.55)",

  typeService:   ACCENT.service,
  typeSource:    ACCENT.source,
  typeDatabase:  ACCENT.database,
  typeCache:     ACCENT.cache,
  typeData:      ACCENT.data,
  typePolicy:    ACCENT.policy,
  typeAdr:       ACCENT.adr,
  typeIncident:  ACCENT.incident,
  typeViolation: ACCENT.incident,
  typeExternal:  ACCENT.external,
  typeConfig:    ACCENT.config,
  typeScript:    ACCENT.script,
  typeDoc:       ACCENT.doc,
  typeAsset:     ACCENT.asset,

  edgeDepends:       "rgba(99, 102, 241, 0.62)",
  edgeDependsArrow:  "rgba(99, 102, 241, 0.78)",
  edgeViolation:     ACCENT.incident,
  edgeEnforces:      "rgba(249, 115, 22, 0.6)",
  edgeEnforcesArrow: "rgba(249, 115, 22, 0.78)",
  edgeWhy:           "rgba(245, 158, 11, 0.6)",
  edgeWhyArrow:      "rgba(245, 158, 11, 0.78)",
  edgeWhyLabel:      ACCENT.policy,
  edgeDrift:         "rgba(239, 68, 68, 0.4)",
};

const LIGHT: GraphPalette = {
  // Solid navy body, white label
  nodeFill:          "#1c2c4e",
  nodeBorder:        "rgba(255, 255, 255, 0.18)",
  nodeText:          "#ffffff",
  nodeTextOutline:   "rgba(15, 23, 42, 0.55)",
  nodeSelectedBorder:"#1c2c4e",
  nodeSelectedFill:  "#1c2c4e",

  edgeLine:          "rgba(35, 31, 32, 0.3)",
  edgeArrow:         "rgba(35, 31, 32, 0.45)",
  edgeLabelText:     "#231f20",
  edgeLabelBg:       "rgba(255, 253, 250, 0.95)",

  spotlightFocusBorder: "#1c2c4e",
  spotlightDimText:     "rgba(35, 31, 32, 0.55)",
  sourceParentBorder:   "rgba(28, 44, 78, 0.45)",
  sourceParentText:     "rgba(35, 31, 32, 0.55)",

  typeService:   ACCENT.service,
  typeSource:    ACCENT.source,
  typeDatabase:  ACCENT.database,
  typeCache:     ACCENT.cache,
  typeData:      ACCENT.data,
  typePolicy:    ACCENT.policy,
  typeAdr:       ACCENT.adr,
  typeIncident:  ACCENT.incident,
  typeViolation: ACCENT.incident,
  typeExternal:  ACCENT.external,
  typeConfig:    ACCENT.config,
  typeScript:    ACCENT.script,
  typeDoc:       ACCENT.doc,
  typeAsset:     ACCENT.asset,

  edgeDepends:       "rgba(99, 102, 241, 0.55)",
  edgeDependsArrow:  "rgba(99, 102, 241, 0.72)",
  edgeViolation:     ACCENT.incident,
  edgeEnforces:      "rgba(249, 115, 22, 0.55)",
  edgeEnforcesArrow: "rgba(249, 115, 22, 0.72)",
  edgeWhy:           "rgba(245, 158, 11, 0.6)",
  edgeWhyArrow:      "rgba(245, 158, 11, 0.75)",
  edgeWhyLabel:      ACCENT.policy,
  edgeDrift:         "rgba(239, 68, 68, 0.32)",
};

// Build a 4 px left-edge stripe via SVG background-image. Cytoscape
// can't draw a one-sided border, so we layer a vertical accent column
// over the solid node fill. The SVG is sized 4×1 and stretched across
// the node via background-fit:none + background-position-x:0%, so it
// renders as a flat left-side bar regardless of node width.
function leftStripeSvg(color: string): string {
  const c = color.replace("#", "%23");
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 1' preserveAspectRatio='none'><rect width='4' height='1' fill='${c}'/></svg>")`;
}

function buildCyStylesheet(theme: GraphTheme) {
  const t = theme === "light" ? LIGHT : DARK;
  // Per-type stripe images keyed by type name. Each rule below sets
  // `background-image` to one of these and Cytoscape repaints the
  // stripe whenever the node redraws.
  const stripe = (color: string) => ({
    "background-image":             leftStripeSvg(color),
    "background-fit":               "none" as any,
    "background-image-opacity":     1,
    "background-position-x":        "0%",
    "background-position-y":        "50%",
    "background-width":             "4px" as any,
    "background-height":            "100%" as any,
  });
  return [
    {
      // Base node: solid body (navy on light, slate on dark) with a
      // soft 1 px outline. Per-type rules below add a 4 px left stripe
      // via `background-image` so types read at a glance without the
      // full-perimeter border the previous design used. Labels are
      // flat 18 px / weight 400 for a calmer, more uniform canvas.
      selector: "node",
      style: {
        "background-color":     t.nodeFill,
        "background-opacity":   1,
        "border-width":         1,
        "border-color":         t.nodeBorder,
        "border-opacity":       1,
        label:                  "data(label)",
        color:                  t.nodeText,
        "text-outline-color":   t.nodeTextOutline,
        "text-outline-width":   1,
        "text-outline-opacity": 1,
        "font-size":            18,
        "font-family":          '"Manrope", -apple-system, BlinkMacSystemFont, sans-serif',
        "font-weight":          400,
        "text-valign":          "center",
        "text-halign":          "center",
        "text-wrap":            "wrap",
        "text-max-width":       "200px",
        "text-overflow-wrap":   "anywhere",
        "line-height":          1.1,
        width:                  220,
        height:                 52,
        shape:                  "roundrectangle",
        padding:                "8px" as any,
        "z-index":              10,
      },
    },

    // Per-type accent stripes. Body stays the per-theme solid color from
    // the base rule; only the left-edge stripe and (for structural
    // types) shape and dimensions change.
    { selector: 'node[type="service"]',   style: { ...stripe(t.typeService) } },
    { selector: 'node[type="source"]',    style: { ...stripe(t.typeSource) } },
    { selector: 'node[type="database"]',  style: { ...stripe(t.typeDatabase),  shape: "barrel" } },
    { selector: 'node[type="cache"]',     style: { ...stripe(t.typeCache),     shape: "barrel" } },
    { selector: 'node[type="data"]',      style: { ...stripe(t.typeData) } },
    { selector: 'node[type="policy"]',    style: { ...stripe(t.typePolicy),    shape: "diamond", width: 110, height: 48 } },
    { selector: 'node[type="adr"]',       style: { ...stripe(t.typeAdr),       shape: "roundrectangle", width: 90, height: 34, "font-size": 14 } },
    { selector: 'node[type="incident"]',  style: { ...stripe(t.typeIncident),  shape: "roundrectangle", width: 90, height: 34, "font-size": 14 } },
    { selector: 'node[type="external"]',  style: { ...stripe(t.typeExternal),  shape: "roundrectangle", width: 100, height: 34, "font-size": 14 } },
    { selector: 'node[type="config"]',    style: { ...stripe(t.typeConfig) } },
    { selector: 'node[type="script"]',    style: { ...stripe(t.typeScript) } },
    { selector: 'node[type="doc"]',       style: { ...stripe(t.typeDoc) } },
    { selector: 'node[type="asset"]',     style: { ...stripe(t.typeAsset) } },
    { selector: 'node[status="violation"]',
      style: { ...stripe(t.typeViolation), "border-width": 2 } },

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

  // Phase 3.6: gate the type legend to the "Other" carousel slide. On
  // community slides the canvas already shows a homogeneous subgraph
  // and the legend would just dilute the focus; on the Other slide the
  // user is staring at every uncategorised node and the legend is the
  // only way to spot type clusters at a glance.
  const params = useParams<{ idx?: string }>();
  const { slides, loading: communitiesLoading } = useCarouselSlides();
  const slideIdx = Number.parseInt(params.idx ?? "0", 10);
  const currentSlide = Number.isFinite(slideIdx) ? slides[slideIdx] : undefined;
  const showLegend = currentSlide?.kind === "other";

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

    // Full unload: when the active set is cleared (no syncs loaded), the
    // store flushes nodes/edges to []. Strip every element from cytoscape
    // and bail before doing layout work \u2014 leaving stale nodes here is
    // what produced the "ghost graph" on back-navigation.
    if (elementsWithParents.length === 0) {
      cy.elements().remove();
      setLoading(false);
      return;
    }

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
   * The Ctrl+K GraphSearchDropdown sets ``pendingZoomNodeId`` via
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

  /* Unmount cleanup. Explicit teardown of the Cytoscape instance so
   * navigating away (e.g. /graph -> /sources -> back) frees the engine
   * and prevents stale renders against a dead container. The init
   * effect already destroys on dep change; this guarantees teardown
   * even if React schedules unmount without re-running init's cleanup
   * (e.g. StrictMode double-invocation, hot reload). */
  useEffect(() => {
    return () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, []);

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

  // Overlay stays up until ALL of:
  //   1. graph engine finished mounting its first chunked-add batch,
  //   2. communities query resolved (Leiden cache present),
  //   3. CarouselEngine's effect has actually called
  //      ``setVisibleSubset`` for the active slide.
  //
  // The third gate is the one the user reported missing — without it
  // there's a render cycle between (2) finishing and (3) running where
  // the canvas paints every node unfiltered ("entire graph"). When
  // slides exist but ``visibleSubset`` is still null, we're in that
  // window — keep the spinner up. Skip the third gate when there are
  // no slides (no Leiden run yet) so the overlay doesn't get stuck.
  const filterPending = slides.length > 0 && !visibleSubset;
  const showOverlay = loading || communitiesLoading || filterPending;
  return (
    <div className="graph-canvas">
      <div className="graph-canvas-inner">
        <div
          ref={containerRef}
          className={`graph-canvas-container${showOverlay ? " is-loading" : ""}`}
        />
        <div
          className={`graph-loading-overlay is-blocking${showOverlay ? " is-visible" : ""}`}
          aria-busy={showOverlay}
          aria-live="polite"
        >
          <Loader2
            className="graph-loading-spinner"
            size={32}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="graph-loading-text">
            {communitiesLoading
              ? "loading communities…"
              : "initialising graph engine…"}
          </span>
        </div>
      </div>

      <div className="graph-overlay-bottom-left">
        <SignalsOverlay />
      </div>

      <div className="graph-overlay-top-right">
        <ViolationBadge />
      </div>

      <div className="graph-overlay-bottom-right">
        {showLegend && <DynamicLegend />}
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
