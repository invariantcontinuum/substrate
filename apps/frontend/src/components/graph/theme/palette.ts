// Graph theme color tokens. Two palettes, identical key shape, so TypeScript
// and the runtime test enforce theme-inversion exhaustiveness.
//
// Color values come from the legacy Cytoscape stylesheet captured in
// commit 14d17f5~1:apps/frontend/src/components/graph/GraphCanvas.tsx.

export const NODE_TYPES = [
  "service", "source", "database", "cache", "data",
  "policy", "adr", "incident", "external",
  "config", "script", "doc", "asset",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  "depends", "depends_on", "violation", "enforces", "why", "drift",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export interface EdgeAccent { line: string; arrow: string; }

export interface Palette {
  canvasBg: string;
  gridLine: string;
  nodeGlassFill: string;
  nodeDefaultBorder: string;
  labelColor: string;
  labelHalo: string;
  selection: string;    // focused-node border + focused-edge accent
  dimText: string;
  edgeDefault: string;
  edgeDefaultArrow: string;
  hullFill: string;
  hullStroke: string;
  typeBorders: Record<NodeType, string>;
  edgeAccents: Record<EdgeType, EdgeAccent>;
}

export const DARK: Palette = {
  canvasBg:          "#101114",
  gridLine:          "rgba(239, 230, 221, 0.06)",
  nodeGlassFill:     "rgba(239, 230, 221, 0.14)",
  nodeDefaultBorder: "rgba(239, 230, 221, 0.32)",
  labelColor:        "#efe6dd",
  labelHalo:         "rgba(35, 31, 32, 0.85)",
  selection:         "#f3dfa2",
  dimText:           "rgba(239, 230, 221, 0.70)",
  edgeDefault:       "rgba(239, 230, 221, 0.22)",
  edgeDefaultArrow:  "rgba(239, 230, 221, 0.40)",
  hullFill:          "rgba(111, 181, 167, 0.08)",
  hullStroke:        "rgba(111, 181, 167, 0.35)",
  typeBorders: {
    service:  "#6fb5a7", source:   "#6fb5a7",
    database: "#d88a73", cache:    "#e8aa99",
    data:     "#d88a73", policy:   "#f3dfa2",
    adr:      "#e6c866", incident: "#e6706b",
    external: "#a19890", config:   "#c5b8a8",
    script:   "#e6c866", doc:      "#d88a73",
    asset:    "#a19890",
  },
  edgeAccents: {
    depends:    { line: "rgba(111, 181, 167, 0.58)", arrow: "rgba(111, 181, 167, 0.75)" },
    depends_on: { line: "rgba(111, 181, 167, 0.58)", arrow: "rgba(111, 181, 167, 0.75)" },
    violation:  { line: "#e6706b",                    arrow: "#e6706b" },
    enforces:   { line: "rgba(216, 138, 115, 0.58)", arrow: "rgba(216, 138, 115, 0.75)" },
    why:        { line: "rgba(243, 223, 162, 0.62)", arrow: "rgba(243, 223, 162, 0.78)" },
    drift:      { line: "rgba(230, 112, 107, 0.40)", arrow: "rgba(230, 112, 107, 0.40)" },
  },
};

export const LIGHT: Palette = {
  canvasBg:          "#f7f2ea",
  gridLine:          "rgba(35, 31, 32, 0.06)",
  nodeGlassFill:     "rgba(255, 255, 255, 0.62)",
  nodeDefaultBorder: "rgba(35, 31, 32, 0.28)",
  labelColor:        "#231f20",
  labelHalo:         "rgba(255, 253, 250, 0.9)",
  selection:         "#1c554e",
  dimText:           "rgba(35, 31, 32, 0.55)",
  edgeDefault:       "rgba(35, 31, 32, 0.30)",
  edgeDefaultArrow:  "rgba(35, 31, 32, 0.45)",
  hullFill:          "rgba(28, 85, 78, 0.06)",
  hullStroke:        "rgba(28, 85, 78, 0.35)",
  typeBorders: {
    service:  "#1c554e", source:   "#1c554e",
    database: "#a64a35", cache:    "#7a3728",
    data:     "#a64a35", policy:   "#c59e3a",
    adr:      "#b8882a", incident: "#a43b3b",
    external: "#6b6866", config:   "#8a7f74",
    script:   "#b8882a", doc:      "#7a3728",
    asset:    "#6b6866",
  },
  edgeAccents: {
    depends:    { line: "rgba(28, 85, 78, 0.55)",   arrow: "rgba(28, 85, 78, 0.72)" },
    depends_on: { line: "rgba(28, 85, 78, 0.55)",   arrow: "rgba(28, 85, 78, 0.72)" },
    violation:  { line: "#a43b3b",                   arrow: "#a43b3b" },
    enforces:   { line: "rgba(116, 48, 31, 0.55)",  arrow: "rgba(116, 48, 31, 0.72)" },
    why:        { line: "rgba(184, 136, 42, 0.60)", arrow: "rgba(184, 136, 42, 0.75)" },
    drift:      { line: "rgba(164, 59, 59, 0.32)",  arrow: "rgba(164, 59, 59, 0.32)" },
  },
};
