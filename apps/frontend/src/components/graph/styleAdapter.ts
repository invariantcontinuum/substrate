// Single source for graph theme tokens. Both GraphCanvas (to feed graph-ui
// via set_theme) and DynamicLegend consume this to stay in sync.

export type Shape =
  | "roundrectangle" | "barrel" | "diamond"
  | "hexagon" | "octagon" | "triangle" | "square" | "circle";

export interface NodeTypeStyle {
  shape: Shape;
  halfWidth: number;
  halfHeight: number;
  cornerRadius: number;
  color: string;
  borderColor: string;
  borderWidth: number;
  labelColor: string;
  labelFont: string;
  labelSize: number;
  labelWeight: number;
}

export interface EdgeTypeStyle {
  color: string;
  width: number;
  style: "solid" | "dashed" | "short-dashed" | "dotted";
  arrow: "triangle" | "none";
}

export interface GraphTheme {
  canvasBg: string;
  gridLineColor: string;
  selectionBorder: string;
  selectionFill: string;
  hullFill: string;
  hullStroke: string;
  dimOpacity: number;
  // Per-type styles consumed by graph-ui's ThemeConfig.nodes.by_type overrides.
  nodeTypes: Record<string, Partial<NodeTypeStyle>>;
  edgeTypes: Record<string, Partial<EdgeTypeStyle>>;
  defaultNodeStyle: NodeTypeStyle;
  defaultEdgeStyle: EdgeTypeStyle;
}

// Per-type accent palette (Phase 3.8). Single source of truth shared
// with the cytoscape stylesheet in GraphCanvas (see ACCENT there). The
// palette is theme-agnostic — accents are flat colors used identically
// in both modes; node body contrast comes from the per-theme node
// fill in GraphCanvas, not from the accent.
const NODE_ACCENT: Record<string, string> = {
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
  doc:       "#64748b", // slate
  asset:     "#9ca3af", // gray
};

const TYPE_SHAPE: Record<string, Shape> = {
  database: "barrel", cache: "barrel",
  policy: "diamond",
};
const TYPE_SIZE: Record<string, { w: number; h: number }> = {
  policy: { w: 110, h: 48 },
  incident: { w: 90, h: 34 },
  adr: { w: 90, h: 34 },
  external: { w: 90, h: 34 },
};

export function buildGraphTheme(themeMode: "light" | "dark"): GraphTheme {
  const isDark = themeMode === "dark";
  // Node body matches GraphCanvas: solid navy on light, solid slate on
  // dark. The label color flips so the body stays high-contrast.
  const nodeBodyColor = isDark ? "#e6e9f0" : "#1c2c4e";
  const labelColor    = isDark ? "#0f172a" : "#ffffff";

  const nodeTypes: Record<string, Partial<NodeTypeStyle>> = {};
  for (const [type, accent] of Object.entries(NODE_ACCENT)) {
    const shape: Shape = TYPE_SHAPE[type] ?? "roundrectangle";
    const sz = TYPE_SIZE[type] ?? { w: 220, h: 52 };
    nodeTypes[type] = {
      shape,
      halfWidth: sz.w / 2,
      halfHeight: sz.h / 2,
      cornerRadius: 8,
      color: nodeBodyColor,
      borderColor: accent,
      borderWidth: 4,
      labelColor,
      labelFont: "'Manrope', -apple-system, sans-serif",
      labelSize: 18,
      labelWeight: 400,
    };
  }

  const edgeTypes: Record<string, Partial<EdgeTypeStyle>> = {
    depends:   { color: isDark ? "rgba(99, 102, 241, 0.85)" : "#6366f1", width: 1.7, style: "solid",       arrow: "triangle" },
    violation: { color: "#ef4444", width: 2.6, style: "dashed",      arrow: "triangle" },
    enforces:  { color: "#f97316", width: 1.9, style: "dotted",      arrow: "triangle" },
    why:       { color: "#f59e0b", width: 1.9, style: "short-dashed",arrow: "triangle" },
  };

  return {
    canvasBg: isDark ? "#101114" : "#f7f2ea",
    gridLineColor: isDark ? "rgba(239,230,221,0.06)" : "rgba(35,31,32,0.06)",
    selectionBorder: isDark ? "#c39b54" : "#1c2c4e",
    selectionFill: isDark ? "rgba(195,155,84,0.24)" : "rgba(28,44,78,0.18)",
    hullFill: isDark ? "rgba(99,102,241,0.08)" : "rgba(28,44,78,0.06)",
    hullStroke: isDark ? "rgba(99,102,241,0.35)" : "rgba(28,44,78,0.35)",
    dimOpacity: 0.34,
    nodeTypes,
    edgeTypes,
    defaultNodeStyle: {
      shape: "roundrectangle",
      halfWidth: 110, halfHeight: 26, cornerRadius: 8,
      color: nodeBodyColor,
      borderColor: isDark ? "#9ca3af" : "#9ca3af",
      borderWidth: 4,
      labelColor,
      labelFont: "'Manrope', -apple-system, sans-serif",
      labelSize: 18,
      labelWeight: 400,
    },
    defaultEdgeStyle: {
      color: isDark ? "rgba(239,230,221,0.55)" : "rgba(35,31,32,0.45)",
      width: 1.3,
      style: "solid",
      arrow: "triangle",
    },
  };
}

/** Convert the pure `GraphTheme` into the `ThemeConfig` JSON graph-ui's
 *  `RenderEngine.set_theme(js_value)` accepts.
 *
 *  ALL FIELDS ARE camelCase — the Rust `ThemeConfig` uses
 *  `#[serde(rename = "halfWidth")]` etc. on every field. Emitting
 *  snake_case makes serde silently ignore the key and fall back to
 *  defaults (tiny square nodes with placeholder colors). That was the
 *  root cause of the "small squares, no rectangles" symptom. */
export function graphThemeToEngineJson(t: GraphTheme): unknown {
  const toNodeStyleFull = (s: NodeTypeStyle) => ({
    shape: s.shape,
    // `size` is required on the default NodeStyle (serde default = 30).
    // Use the max half-dimension so any consumer path that falls back
    // to `size` still renders visibly.
    size: Math.max(s.halfWidth, s.halfHeight),
    halfWidth: s.halfWidth,
    halfHeight: s.halfHeight,
    cornerRadius: s.cornerRadius,
    color: s.color,
    borderWidth: s.borderWidth,
    borderColor: s.borderColor,
  });
  const toNodeOverride = (s: Partial<NodeTypeStyle>) => ({
    shape: s.shape,
    size:
      s.halfWidth !== undefined && s.halfHeight !== undefined
        ? Math.max(s.halfWidth, s.halfHeight)
        : undefined,
    halfWidth: s.halfWidth,
    halfHeight: s.halfHeight,
    cornerRadius: s.cornerRadius,
    color: s.color,
    borderWidth: s.borderWidth,
    borderColor: s.borderColor,
  });
  const toEdgeStyleFull = (s: EdgeTypeStyle) => ({
    color: s.color,
    width: s.width,
    arrow: s.arrow,
  });
  const toEdgeOverride = (s: Partial<EdgeTypeStyle>) => ({
    color: s.color,
    width: s.width,
    style: s.style,
  });

  const byTypeNodes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t.nodeTypes)) byTypeNodes[k] = toNodeOverride(v);
  const byTypeEdges: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t.edgeTypes)) byTypeEdges[k] = toEdgeOverride(v);

  return {
    // Transparent so the `.graph-canvas-container` CSS grid-lines render
    // through the WebGL canvas. The visible "page" background still uses
    // canvasBg via the container's CSS.
    background: "rgba(0,0,0,0)",
    nodes: {
      default: toNodeStyleFull(t.defaultNodeStyle),
      byType: byTypeNodes,
    },
    edges: {
      default: toEdgeStyleFull(t.defaultEdgeStyle),
      byType: byTypeEdges,
    },
    communities: {
      hull: false,
      hullOpacity: 0.15,
    },
    interaction: {
      select: {
        borderColor: t.selectionBorder,
        borderWidth: 3.0,
      },
      spotlight: {
        dimOpacity: t.dimOpacity,
      },
    },
  };
}
