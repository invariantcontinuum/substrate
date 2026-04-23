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

// Dark palette — tuned to match the legacy Cytoscape look.
// Legacy renders near-opaque cream rectangles (not transparent glass): direct
// pixel sampling of the legacy canvas shows fill alpha ≈ 0.9. The previous
// 0.14 alpha made our nodes bleed into the dark background and the shape
// read as faint outlines instead of solid cards.
// Edge alphas are lowered from the old 0.58 because our engine tessellates
// every logical edge into 8 quadratic-bezier segments — at the old alpha the
// overdraw between adjacent segments accumulated into a bright smear across
// the graph. 0.16 × 8 ≈ the visual density of a single legacy edge line.
export const DARK: Palette = {
  canvasBg:          "#101114",
  gridLine:          "rgba(239, 230, 221, 0.06)",
  nodeGlassFill:     "rgba(239, 230, 221, 0.92)",
  nodeDefaultBorder: "rgba(35, 31, 32, 0.55)",
  labelColor:        "#231f20",
  labelHalo:         "rgba(239, 230, 221, 0.95)",
  selection:         "#f3dfa2",
  dimText:           "rgba(239, 230, 221, 0.70)",
  edgeDefault:       "rgba(239, 230, 221, 0.10)",
  edgeDefaultArrow:  "rgba(239, 230, 221, 0.26)",
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
    depends:    { line: "rgba(111, 181, 167, 0.16)", arrow: "rgba(111, 181, 167, 0.55)" },
    depends_on: { line: "rgba(111, 181, 167, 0.16)", arrow: "rgba(111, 181, 167, 0.55)" },
    violation:  { line: "rgba(230, 112, 107, 0.45)", arrow: "#e6706b" },
    enforces:   { line: "rgba(216, 138, 115, 0.18)", arrow: "rgba(216, 138, 115, 0.60)" },
    why:        { line: "rgba(243, 223, 162, 0.20)", arrow: "rgba(243, 223, 162, 0.62)" },
    drift:      { line: "rgba(230, 112, 107, 0.15)", arrow: "rgba(230, 112, 107, 0.40)" },
  },
};

export const LIGHT: Palette = {
  canvasBg:          "#f7f2ea",
  gridLine:          "rgba(35, 31, 32, 0.08)",
  // Slightly more opaque fill so nodes lift off the cream canvas instead of
  // disappearing into it. The prior 0.62 alpha produced near-invisible
  // rectangles at fit zoom — borders did all the work and spotlight dim had
  // nothing to fade. This also makes the halo behind labels read cleanly.
  nodeGlassFill:     "rgba(255, 255, 255, 0.88)",
  nodeDefaultBorder: "rgba(35, 31, 32, 0.42)",
  labelColor:        "#231f20",
  labelHalo:         "rgba(255, 253, 250, 0.92)",
  selection:         "#1c554e",
  dimText:           "rgba(35, 31, 32, 0.55)",
  edgeDefault:       "rgba(35, 31, 32, 0.38)",
  edgeDefaultArrow:  "rgba(35, 31, 32, 0.55)",
  hullFill:          "rgba(28, 85, 78, 0.08)",
  hullStroke:        "rgba(28, 85, 78, 0.38)",
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
