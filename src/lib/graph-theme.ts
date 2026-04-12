// Graph theme objects for the WASM+WebGL engine.
// The engine renders via GPU, not DOM, so CSS variables don't reach it.
// We export both dark and light variants; GraphCanvas picks the active
// one from useThemeStore and passes it as the `theme` prop on <Graph>.

// Shared structure (node types, shapes, sizes, interaction) — only colors differ.
const sharedNodes = {
  default: {
    shape: "roundrectangle",
    size: 30,
    halfWidth: 55,
    halfHeight: 19,
    cornerRadius: 0.3,
    borderWidth: 2,
    label: { field: "name", size: 12 },
  },
  byType: {
    source:   { borderWidth: 2 },
    config:   { borderWidth: 1.8 },
    script:   { borderWidth: 1.8 },
    doc:      { halfWidth: 45, halfHeight: 16, borderWidth: 1.2 },
    data:     { halfWidth: 42, halfHeight: 16, borderWidth: 1.5 },
    asset:    { halfWidth: 38, halfHeight: 14, borderWidth: 1 },
    service:  { borderWidth: 2 },
    database: { shape: "barrel", borderWidth: 2 },
    cache:    { shape: "barrel", borderWidth: 2 },
    policy:   { shape: "diamond", halfWidth: 58, halfHeight: 28, borderWidth: 2.5 },
    adr:      { halfWidth: 42, halfHeight: 17, borderWidth: 2 },
    incident: { halfWidth: 42, halfHeight: 17, borderWidth: 2 },
    external: { halfWidth: 48, halfHeight: 17, borderWidth: 1.5 },
  },
  byStatus: {
    violation: { borderWidth: 3, pulse: true },
    warning:   { borderWidth: 2.5 },
    enforced:  { borderWidth: 2.5 },
  },
};

const sharedEdges = {
  default: { width: 1.2, arrow: "target", arrowScale: 1.0 },
  byType: {
    depends:    { width: 1.3 },
    depends_on: { width: 1.3 },
    violation:  { width: 2.4, style: "dashed", animate: true },
    enforces:   { width: 1.6, style: "dotted" },
    why:        { width: 1.6, style: "dashed" },
    drift:      { width: 1.5, style: "dashed" },
  },
};

const sharedInteraction = {
  hover:     { scale: 1.35, highlightNeighbors: true, dimOthers: 0.18 },
  select:    { borderWidth: 3.5, expandLabel: true },
  spotlight: { dimOpacity: 0.06, transitionMs: 260 },
};

// ─── Dark Theme (Night Neon) ───
export const darkGraphTheme = {
  background: "#07070b",
  nodes: {
    default: {
      ...sharedNodes.default,
      color: "rgba(255,255,255,0.03)",
      borderColor: "rgba(255,255,255,0.22)",
      label: { ...sharedNodes.default.label, color: "#e2e8f0" },
    },
    byType: {
      source:   { ...sharedNodes.byType.source,   color: "rgba(34,211,238,0.10)",  borderColor: "#22d3ee" },
      config:   { ...sharedNodes.byType.config,   color: "rgba(251,191,36,0.10)",  borderColor: "#fbbf24" },
      script:   { ...sharedNodes.byType.script,   color: "rgba(52,211,153,0.10)",  borderColor: "#34d399" },
      doc:      { ...sharedNodes.byType.doc,       color: "rgba(148,163,184,0.06)", borderColor: "#64748b" },
      data:     { ...sharedNodes.byType.data,      color: "rgba(56,189,248,0.08)",  borderColor: "#38bdf8" },
      asset:    { ...sharedNodes.byType.asset,     color: "rgba(100,116,139,0.05)", borderColor: "#475569" },
      service:  { ...sharedNodes.byType.service,   color: "rgba(99,102,241,0.12)",  borderColor: "#818cf8" },
      database: { ...sharedNodes.byType.database,  color: "rgba(52,211,153,0.12)",  borderColor: "#34d399" },
      cache:    { ...sharedNodes.byType.cache,     color: "rgba(163,230,53,0.12)",  borderColor: "#a3e635" },
      policy:   { ...sharedNodes.byType.policy,    color: "rgba(167,139,250,0.14)", borderColor: "#a78bfa" },
      adr:      { ...sharedNodes.byType.adr,       color: "rgba(251,191,36,0.10)",  borderColor: "#fbbf24" },
      incident: { ...sharedNodes.byType.incident,  color: "rgba(244,114,182,0.12)", borderColor: "#f472b6" },
      external: { ...sharedNodes.byType.external,  color: "rgba(148,163,184,0.08)", borderColor: "#94a3b8" },
    },
    byStatus: {
      violation: { ...sharedNodes.byStatus.violation, color: "rgba(239,68,68,0.18)", borderColor: "#ef4444" },
      warning:   { ...sharedNodes.byStatus.warning,   borderColor: "#fb923c" },
      enforced:  { ...sharedNodes.byStatus.enforced,   borderColor: "#c4b5fd" },
    },
  },
  edges: {
    default: { ...sharedEdges.default, color: "rgba(226,232,240,0.22)" },
    byType: {
      depends:    { ...sharedEdges.byType.depends,    color: "rgba(34,211,238,0.42)" },
      depends_on: { ...sharedEdges.byType.depends_on, color: "rgba(34,211,238,0.42)" },
      violation:  { ...sharedEdges.byType.violation,  color: "#ef4444" },
      enforces:   { ...sharedEdges.byType.enforces,   color: "rgba(167,139,250,0.6)" },
      why:        { ...sharedEdges.byType.why,        color: "rgba(251,191,36,0.6)" },
      drift:      { ...sharedEdges.byType.drift,      color: "rgba(244,114,182,0.5)" },
    },
  },
  communities: { hull: false, hullOpacity: 0.08, palette: "categorical-12" },
  interaction: {
    ...sharedInteraction,
    select: { ...sharedInteraction.select, borderColor: "#ffffff" },
  },
} as const;

// ─── Light Theme (Paper Blueprint) ───
export const lightGraphTheme = {
  background: "#f4f4f8",
  nodes: {
    default: {
      ...sharedNodes.default,
      color: "rgba(0,0,0,0.02)",
      borderColor: "rgba(0,0,0,0.15)",
      label: { ...sharedNodes.default.label, color: "#1e1e2e" },
    },
    byType: {
      source:   { ...sharedNodes.byType.source,   color: "rgba(6,182,212,0.08)",   borderColor: "#0891b2" },
      config:   { ...sharedNodes.byType.config,   color: "rgba(217,119,6,0.08)",   borderColor: "#b45309" },
      script:   { ...sharedNodes.byType.script,   color: "rgba(5,150,105,0.08)",   borderColor: "#047857" },
      doc:      { ...sharedNodes.byType.doc,       color: "rgba(100,116,139,0.06)", borderColor: "#94a3b8" },
      data:     { ...sharedNodes.byType.data,      color: "rgba(14,165,233,0.06)",  borderColor: "#0284c7" },
      asset:    { ...sharedNodes.byType.asset,     color: "rgba(148,163,184,0.05)", borderColor: "#cbd5e1" },
      service:  { ...sharedNodes.byType.service,   color: "rgba(79,70,229,0.08)",   borderColor: "#4f46e5" },
      database: { ...sharedNodes.byType.database,  color: "rgba(5,150,105,0.08)",   borderColor: "#047857" },
      cache:    { ...sharedNodes.byType.cache,     color: "rgba(101,163,13,0.08)",  borderColor: "#4d7c0f" },
      policy:   { ...sharedNodes.byType.policy,    color: "rgba(124,58,237,0.08)",  borderColor: "#6d28d9" },
      adr:      { ...sharedNodes.byType.adr,       color: "rgba(217,119,6,0.08)",   borderColor: "#b45309" },
      incident: { ...sharedNodes.byType.incident,  color: "rgba(219,39,119,0.08)",  borderColor: "#be185d" },
      external: { ...sharedNodes.byType.external,  color: "rgba(100,116,139,0.05)", borderColor: "#64748b" },
    },
    byStatus: {
      violation: { ...sharedNodes.byStatus.violation, color: "rgba(220,38,38,0.10)", borderColor: "#dc2626" },
      warning:   { ...sharedNodes.byStatus.warning,   borderColor: "#ea580c" },
      enforced:  { ...sharedNodes.byStatus.enforced,   borderColor: "#7c3aed" },
    },
  },
  edges: {
    default: { ...sharedEdges.default, color: "rgba(0,0,0,0.12)" },
    byType: {
      depends:    { ...sharedEdges.byType.depends,    color: "rgba(6,182,212,0.45)" },
      depends_on: { ...sharedEdges.byType.depends_on, color: "rgba(6,182,212,0.45)" },
      violation:  { ...sharedEdges.byType.violation,  color: "#dc2626" },
      enforces:   { ...sharedEdges.byType.enforces,   color: "rgba(124,58,237,0.5)" },
      why:        { ...sharedEdges.byType.why,        color: "rgba(217,119,6,0.55)" },
      drift:      { ...sharedEdges.byType.drift,      color: "rgba(219,39,119,0.45)" },
    },
  },
  communities: { hull: false, hullOpacity: 0.06, palette: "categorical-12" },
  interaction: {
    ...sharedInteraction,
    select: { ...sharedInteraction.select, borderColor: "#111827" },
  },
} as const;

/** Pick the right graph theme based on the app's current theme mode. */
export function getGraphTheme(mode: "dark" | "light") {
  return mode === "light" ? lightGraphTheme : darkGraphTheme;
}
