import type cytoscape from "cytoscape";

// ─── Dark Stylesheet ───
export const darkStylesheet: cytoscape.StylesheetJsonBlock[] = [
  // Base node
  {
    selector: "node",
    style: {
      width: 110,
      height: 38,
      shape: "roundrectangle",
      "background-color": "#0d0d12",
      "border-width": 1.5,
      "border-color": "rgba(255,255,255,0.12)",
      label: "data(name)",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 11,
      "font-weight": 500,
      color: "#c0c0d8",
      "font-family": "'Geist Variable', -apple-system, system-ui, sans-serif",
      "text-max-width": "96px",
      "text-wrap": "ellipsis",
    },
  },

  // Node type selectors
  {
    selector: "node[type='source']",
    style: {
      "border-color": "#22d3ee",
      "background-color": "#0a1a1e",
      color: "#a5f3fc",
    },
  },
  {
    selector: "node[type='config']",
    style: {
      "border-color": "#fbbf24",
      "background-color": "#1a1400",
      color: "#fde68a",
      width: 100,
      height: 34,
    },
  },
  {
    selector: "node[type='script']",
    style: {
      "border-color": "#34d399",
      "background-color": "#0a1a14",
      color: "#6ee7b7",
      width: 100,
      height: 34,
    },
  },
  {
    selector: "node[type='doc']",
    style: {
      "border-color": "#64748b",
      "background-color": "#0f1118",
      color: "#94a3b8",
      width: 90,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: "node[type='data']",
    style: {
      "border-color": "#38bdf8",
      "background-color": "#0a1520",
      color: "#7dd3fc",
      width: 90,
      height: 32,
    },
  },
  {
    selector: "node[type='asset']",
    style: {
      "border-color": "#475569",
      "background-color": "#0d1117",
      color: "#94a3b8",
      width: 80,
      height: 30,
      "font-size": 10,
    },
  },
  {
    selector: "node[type='service']",
    style: {
      "border-color": "#3b4199",
      "background-color": "#0f0f1f",
      color: "#c7d2fe",
    },
  },
  {
    selector: "node[type='database']",
    style: {
      "border-color": "#065f46",
      "background-color": "#0a1a14",
      color: "#6ee7b7",
      shape: "barrel",
    },
  },
  {
    selector: "node[type='cache']",
    style: {
      "border-color": "#047857",
      "background-color": "#0a1a14",
      color: "#6ee7b7",
      shape: "barrel",
    },
  },
  {
    selector: "node[type='policy']",
    style: {
      "border-color": "#7c3aed",
      "background-color": "#150a2a",
      color: "#d8b4fe",
      shape: "diamond",
      width: 110,
      height: 48,
      "border-width": 2,
    },
  },
  {
    selector: "node[type='adr']",
    style: {
      "border-color": "#92400e",
      "background-color": "#1a1400",
      color: "#fcd34d",
      width: 80,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: "node[type='incident']",
    style: {
      "border-color": "#991b1b",
      "background-color": "#1a0505",
      color: "#fca5a5",
      width: 80,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: "node[type='external']",
    style: {
      "border-color": "#374151",
      "background-color": "#0d1117",
      color: "#9ca3af",
      width: 90,
      height: 32,
      "font-size": 10,
    },
  },

  // Status override
  {
    selector: "node[status='violation']",
    style: {
      "border-color": "#ef4444",
      "background-color": "#1a0505",
      "border-width": 2,
    },
  },

  // Base edge
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "rgba(255,255,255,0.1)",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "rgba(255,255,255,0.1)",
      "arrow-scale": 0.8,
      "curve-style": "bezier",
    },
  },
  {
    selector: "edge[type='depends']",
    style: {
      "line-color": "rgba(99,102,241,0.3)",
      "target-arrow-color": "rgba(99,102,241,0.4)",
    },
  },
  {
    selector: "edge[type='violation']",
    style: {
      "line-color": "#ef4444",
      "target-arrow-color": "#ef4444",
      width: 2,
      "line-style": "dashed",
    },
  },
  {
    selector: "edge[type='enforces']",
    style: {
      "line-color": "rgba(168,85,247,0.5)",
      "target-arrow-color": "rgba(168,85,247,0.5)",
      width: 1.5,
      "line-style": "dotted",
    },
  },
  {
    selector: "edge[type='why']",
    style: {
      "line-color": "rgba(245,158,11,0.5)",
      "target-arrow-color": "rgba(245,158,11,0.5)",
      width: 1.5,
      "line-style": "dashed",
    },
  },
  {
    selector: "edge[type='drift']",
    style: {
      "line-color": "rgba(239,68,68,0.3)",
      "target-arrow-color": "rgba(239,68,68,0.3)",
      "line-style": "dashed",
    },
  },

  // Interaction
  {
    selector: "node:selected",
    style: {
      "border-width": 3,
      "border-color": "#ffffff",
    },
  },
];

// ─── Light Stylesheet ───
export const lightStylesheet: cytoscape.StylesheetJsonBlock[] = [
  // Base node
  {
    selector: "node",
    style: {
      width: 110,
      height: 38,
      shape: "roundrectangle",
      "background-color": "#e8eaef",
      "border-width": 1.5,
      "border-color": "rgba(0,0,0,0.12)",
      label: "data(name)",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 11,
      "font-weight": 500,
      color: "#3D4852",
      "font-family": "'Geist Variable', -apple-system, system-ui, sans-serif",
      "text-max-width": "96px",
      "text-wrap": "ellipsis",
    },
  },

  // Node type selectors
  {
    selector: "node[type='source']",
    style: {
      "border-color": "#0891b2",
      "background-color": "#ecfeff",
      color: "#155e75",
    },
  },
  {
    selector: "node[type='config']",
    style: {
      "border-color": "#b45309",
      "background-color": "#fffbeb",
      color: "#78350f",
      width: 100,
      height: 34,
    },
  },
  {
    selector: "node[type='script']",
    style: {
      "border-color": "#047857",
      "background-color": "#ecfdf5",
      color: "#065f46",
      width: 100,
      height: 34,
    },
  },
  {
    selector: "node[type='doc']",
    style: {
      "border-color": "#94a3b8",
      "background-color": "#f1f5f9",
      color: "#475569",
      width: 90,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: "node[type='data']",
    style: {
      "border-color": "#0284c7",
      "background-color": "#f0f9ff",
      color: "#075985",
      width: 90,
      height: 32,
    },
  },
  {
    selector: "node[type='asset']",
    style: {
      "border-color": "#cbd5e1",
      "background-color": "#f8fafc",
      color: "#64748b",
      width: 80,
      height: 30,
      "font-size": 10,
    },
  },
  {
    selector: "node[type='service']",
    style: {
      "border-color": "#4f46e5",
      "background-color": "#eef2ff",
      color: "#3730a3",
    },
  },
  {
    selector: "node[type='database']",
    style: {
      "border-color": "#047857",
      "background-color": "#ecfdf5",
      color: "#065f46",
      shape: "barrel",
    },
  },
  {
    selector: "node[type='cache']",
    style: {
      "border-color": "#4d7c0f",
      "background-color": "#f7fee7",
      color: "#3f6212",
      shape: "barrel",
    },
  },
  {
    selector: "node[type='policy']",
    style: {
      "border-color": "#6d28d9",
      "background-color": "#f5f3ff",
      color: "#5b21b6",
      shape: "diamond",
      width: 110,
      height: 48,
      "border-width": 2,
    },
  },
  {
    selector: "node[type='adr']",
    style: {
      "border-color": "#b45309",
      "background-color": "#fffbeb",
      color: "#92400e",
      width: 80,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: "node[type='incident']",
    style: {
      "border-color": "#dc2626",
      "background-color": "#fef2f2",
      color: "#991b1b",
      width: 80,
      height: 32,
      "font-size": 10,
    },
  },
  {
    selector: "node[type='external']",
    style: {
      "border-color": "#64748b",
      "background-color": "#f1f5f9",
      color: "#475569",
      width: 90,
      height: 32,
      "font-size": 10,
    },
  },

  // Status override
  {
    selector: "node[status='violation']",
    style: {
      "border-color": "#dc2626",
      "background-color": "#fef2f2",
      "border-width": 2,
    },
  },

  // Base edge
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "rgba(0,0,0,0.1)",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "rgba(0,0,0,0.1)",
      "arrow-scale": 0.8,
      "curve-style": "bezier",
    },
  },
  {
    selector: "edge[type='depends']",
    style: {
      "line-color": "rgba(79,70,229,0.35)",
      "target-arrow-color": "rgba(79,70,229,0.45)",
    },
  },
  {
    selector: "edge[type='violation']",
    style: {
      "line-color": "#dc2626",
      "target-arrow-color": "#dc2626",
      width: 2,
      "line-style": "dashed",
    },
  },
  {
    selector: "edge[type='enforces']",
    style: {
      "line-color": "rgba(124,58,237,0.5)",
      "target-arrow-color": "rgba(124,58,237,0.5)",
      width: 1.5,
      "line-style": "dotted",
    },
  },
  {
    selector: "edge[type='why']",
    style: {
      "line-color": "rgba(217,119,6,0.55)",
      "target-arrow-color": "rgba(217,119,6,0.55)",
      width: 1.5,
      "line-style": "dashed",
    },
  },
  {
    selector: "edge[type='drift']",
    style: {
      "line-color": "rgba(220,38,38,0.3)",
      "target-arrow-color": "rgba(220,38,38,0.3)",
      "line-style": "dashed",
    },
  },

  // Interaction
  {
    selector: "node:selected",
    style: {
      "border-width": 3,
      "border-color": "#111827",
    },
  },
];
