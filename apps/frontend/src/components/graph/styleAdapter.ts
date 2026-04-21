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

const DARK_NODE_BORDERS: Record<string, string> = {
  service: "#6fb5a7", source: "#6fb5a7", database: "#d88a73", cache: "#e8aa99",
  data: "#d88a73", policy: "#f3dfa2", adr: "#e6c866", incident: "#e6706b",
  external: "#a19890", config: "#c5b8a8", script: "#e6c866", doc: "#d88a73",
  asset: "#a19890",
};
const LIGHT_NODE_BORDERS: Record<string, string> = {
  service: "#1c554e", source: "#1c554e", database: "#a64a35", cache: "#7a3728",
  data: "#a64a35", policy: "#c59e3a", adr: "#b8882a", incident: "#a43b3b",
  external: "#6b6866", config: "#8a7f74", script: "#b8882a", doc: "#7a3728",
  asset: "#6b6866",
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
  const borders = isDark ? DARK_NODE_BORDERS : LIGHT_NODE_BORDERS;
  const fill = isDark ? "rgba(239,230,221,0.14)" : "rgba(255,255,255,0.62)";
  const labelColor = isDark ? "#efe6dd" : "#231f20";

  const nodeTypes: Record<string, Partial<NodeTypeStyle>> = {};
  for (const [type, borderColor] of Object.entries(borders)) {
    const shape: Shape = TYPE_SHAPE[type] ?? "roundrectangle";
    const sz = TYPE_SIZE[type] ?? { w: 110, h: 38 };
    nodeTypes[type] = {
      shape,
      halfWidth: sz.w / 2,
      halfHeight: sz.h / 2,
      cornerRadius: 8,
      color: fill,
      borderColor,
      borderWidth: 1.4,
      labelColor,
      labelFont: "'Manrope', -apple-system, sans-serif",
      labelSize: 11,
      labelWeight: 700,
    };
  }

  const edgeTypes: Record<string, Partial<EdgeTypeStyle>> = {
    depends:   { color: isDark ? "#6fb5a7" : "#1c554e", width: 1.2, style: "solid",       arrow: "triangle" },
    violation: { color: isDark ? "#e6706b" : "#a43b3b", width: 2.2, style: "dashed",      arrow: "triangle" },
    enforces:  { color: isDark ? "#d88a73" : "#a64a35", width: 1.5, style: "dotted",      arrow: "triangle" },
    why:       { color: isDark ? "#f3dfa2" : "#c59e3a", width: 1.5, style: "short-dashed",arrow: "triangle" },
  };

  return {
    canvasBg: isDark ? "#17181a" : "#f5f1ea",
    gridLineColor: isDark ? "rgba(239,230,221,0.06)" : "rgba(35,31,32,0.06)",
    selectionBorder: isDark ? "#f3dfa2" : "#1c554e",
    selectionFill: isDark ? "rgba(243,223,162,0.18)" : "rgba(28,85,78,0.12)",
    hullFill: isDark ? "rgba(111,181,167,0.08)" : "rgba(28,85,78,0.06)",
    hullStroke: isDark ? "rgba(111,181,167,0.35)" : "rgba(28,85,78,0.35)",
    dimOpacity: 0.28,
    nodeTypes,
    edgeTypes,
    defaultNodeStyle: {
      shape: "roundrectangle",
      halfWidth: 55, halfHeight: 19, cornerRadius: 8,
      color: fill,
      borderColor: isDark ? "rgba(239,230,221,0.28)" : "rgba(35,31,32,0.22)",
      borderWidth: 1.2,
      labelColor,
      labelFont: "'Manrope', -apple-system, sans-serif",
      labelSize: 11,
      labelWeight: 700,
    },
    defaultEdgeStyle: {
      color: isDark ? "rgba(239,230,221,0.42)" : "rgba(35,31,32,0.32)",
      width: 1.0,
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
