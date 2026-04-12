// Night-neon graph theme for the substrate canvas.
//
// Design direction — Holographic UI. Deep near-black substrate, vivid high-chroma
// accents at equal intervals on the HSL wheel, faint fill glows so every shape
// reads as a lit-from-within neon outline instead of a dark silhouette on dark.
//
// Hue assignments pick the strongest remembered-color for each concept:
//   service   → electric cyan  (code flows, signal)
//   database  → emerald        (classic storage green, brightened)
//   cache     → lime           (adjacent to DB but yellow-shifted for distinction)
//   policy    → violet         (governance, authority)
//   adr       → amber          (decision, warmth)
//   incident  → fuchsia        (alarm color, reserves red for violations)
//   external  → slate          (desaturated — recedes visually)
//
// Edges mirror the node-type hues at 40-60% alpha so they suggest the receiving
// node without competing with it. Violations are the only pure red in the scene,
// making them impossible to miss even in a 4000-node curl repo.

export const graphTheme = {
  background: "#07070b",
  nodes: {
    default: {
      shape: "roundrectangle",
      size: 30,
      halfWidth: 55,
      halfHeight: 19,
      cornerRadius: 0.3,
      color: "rgba(255,255,255,0.03)",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.22)",
      label: { field: "name", color: "#e2e8f0", size: 12 },
    },
    byType: {
      service: {
        color: "rgba(34,211,238,0.10)",
        borderColor: "#22d3ee",
        borderWidth: 2,
      },
      database: {
        shape: "barrel",
        color: "rgba(52,211,153,0.12)",
        borderColor: "#34d399",
        borderWidth: 2,
      },
      cache: {
        shape: "barrel",
        color: "rgba(163,230,53,0.12)",
        borderColor: "#a3e635",
        borderWidth: 2,
      },
      policy: {
        shape: "diamond",
        halfWidth: 58,
        halfHeight: 28,
        color: "rgba(167,139,250,0.14)",
        borderColor: "#a78bfa",
        borderWidth: 2.5,
      },
      adr: {
        halfWidth: 42,
        halfHeight: 17,
        color: "rgba(251,191,36,0.10)",
        borderColor: "#fbbf24",
        borderWidth: 2,
      },
      incident: {
        halfWidth: 42,
        halfHeight: 17,
        color: "rgba(244,114,182,0.12)",
        borderColor: "#f472b6",
        borderWidth: 2,
      },
      external: {
        halfWidth: 48,
        halfHeight: 17,
        color: "rgba(148,163,184,0.08)",
        borderColor: "#94a3b8",
        borderWidth: 1.5,
      },
    },
    byStatus: {
      violation: {
        color: "rgba(239,68,68,0.18)",
        borderColor: "#ef4444",
        borderWidth: 3,
        pulse: true,
      },
      warning: {
        borderColor: "#fb923c",
        borderWidth: 2.5,
      },
      enforced: {
        borderColor: "#c4b5fd",
        borderWidth: 2.5,
      },
    },
  },
  edges: {
    default: {
      color: "rgba(226,232,240,0.22)",
      width: 1.2,
      arrow: "target",
      arrowScale: 1.0,
    },
    byType: {
      depends: { color: "rgba(34,211,238,0.42)", width: 1.3 },
      depends_on: { color: "rgba(34,211,238,0.42)", width: 1.3 },
      violation: {
        color: "#ef4444",
        width: 2.4,
        style: "dashed",
        animate: true,
      },
      enforces: {
        color: "rgba(167,139,250,0.6)",
        width: 1.6,
        style: "dotted",
      },
      why: {
        color: "rgba(251,191,36,0.6)",
        width: 1.6,
        style: "dashed",
      },
      drift: {
        color: "rgba(244,114,182,0.5)",
        width: 1.5,
        style: "dashed",
      },
    },
  },
  communities: {
    hull: false,
    hullOpacity: 0.08,
    palette: "categorical-12",
  },
  interaction: {
    hover: {
      scale: 1.35,
      highlightNeighbors: true,
      dimOthers: 0.18,
    },
    select: {
      borderColor: "#ffffff",
      borderWidth: 3.5,
      expandLabel: true,
    },
    spotlight: {
      dimOpacity: 0.06,
      transitionMs: 260,
    },
  },
} as const;
