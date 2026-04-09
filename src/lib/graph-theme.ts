export const graphTheme = {
  background: "#0d1117",
  nodes: {
    default: {
      shape: "circle",
      size: 12,
      color: "#8b949e",
      borderWidth: 1.5,
      borderColor: "#30363d",
      label: { field: "name", color: "#c9d1d9", size: 11 },
    },
    byType: {
      service: { shape: "circle", color: "#58a6ff", size: 16 },
      database: { shape: "diamond", color: "#3fb950", size: 14 },
      cache: { shape: "hexagon", color: "#f0883e" },
      policy: { shape: "square", color: "#a371f7" },
      adr: { shape: "triangle", color: "#d2a8ff" },
      incident: { shape: "octagon", color: "#f85149", size: 18 },
      external: { shape: "circle", color: "#484f58", borderStyle: "dashed" },
    },
    byStatus: {
      violation: { borderColor: "#f85149", borderWidth: 3, pulse: true },
      warning: { borderColor: "#d29922", borderWidth: 2 },
      enforced: { borderColor: "#a371f7", borderWidth: 2 },
    },
  },
  edges: {
    default: { color: "#21262d", width: 1, arrow: "target" },
    byType: {
      DEPENDS_ON: { color: "#58a6ff", width: 1.5 },
      CALLS: { color: "#3fb950", style: "solid" },
      violation: { color: "#f85149", width: 2, style: "dashed" },
      enforces: { color: "#a371f7", style: "dotted" },
      drift: { color: "#d29922", style: "dashed", animate: true },
    },
  },
  communities: { hull: true, hullOpacity: 0.06, palette: "categorical-12" },
  interaction: {
    hover: { scale: 1.3, highlightNeighbors: true, dimOthers: 0.15 },
    select: { borderColor: "#ffffff", borderWidth: 3, expandLabel: true },
    spotlight: { dimOpacity: 0.05, transitionMs: 300 },
  },
};
