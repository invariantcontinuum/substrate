import type { StylesheetStyle } from "cytoscape";

export const cytoscapeStyles: StylesheetStyle[] = [
  // ── Base defaults ──
  {
    selector: "node",
    style: {
      "background-color": "rgb(13,13,18)",
      "border-width": 1.5,
      "border-color": "rgb(255,255,255)",
      label: "data(label)",
      color: "rgb(192,192,216)",
      "font-size": "11px",
      "font-family": "Inter, sans-serif",
      "font-weight": 500,
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "none",
      width: 110,
      height: 38,
      shape: "roundrectangle",
      padding: "8px",
      "z-index": 10,
    },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.8,
      width: 1,
      "line-color": "rgb(255,255,255)",
      "target-arrow-color": "rgb(255,255,255)",
      label: "",
      color: "rgb(102,102,128)",
      "font-size": "9px",
      "text-background-color": "rgb(6,6,8)",
      "text-background-opacity": 1,
      "text-background-padding": "2px",
    },
  },

  // ── Node types ──
  {
    selector: 'node[type="service"]',
    style: {
      shape: "roundrectangle",
      "background-color": "rgb(15,15,31)",
      "border-color": "rgb(59,65,153)",
      color: "rgb(199,210,254)",
      "font-size": "10px",
      width: 120,
      height: 36,
      "text-max-width": "100px",
      "text-wrap": "ellipsis",
    },
  },
  {
    selector: 'node[type="database"]',
    style: {
      shape: "roundrectangle",
      "background-color": "rgb(10,26,20)",
      "border-color": "rgb(6,95,70)",
      color: "rgb(110,231,183)",
      "font-size": "10px",
      width: 120,
      height: 36,
      "text-max-width": "100px",
      "text-wrap": "ellipsis",
    },
  },
  {
    selector: 'node[type="cache"]',
    style: {
      shape: "barrel",
      "background-color": "rgb(10,26,20)",
      "border-color": "rgb(4,120,87)",
      color: "rgb(110,231,183)",
      "font-size": "10px",
      width: 120,
      height: 36,
    },
  },
  {
    selector: 'node[type="external"]',
    style: {
      shape: "roundrectangle",
      "background-color": "rgb(13,17,23)",
      "border-color": "rgb(55,65,81)",
      "border-width": 1,
      color: "rgb(156,163,175)",
      "font-size": "9px",
      width: 100,
      height: 32,
      "text-max-width": "80px",
      "text-wrap": "ellipsis",
    },
  },
  {
    selector: 'node[type="policy"]',
    style: {
      shape: "diamond",
      "background-color": "rgb(21,10,42)",
      "border-color": "rgb(124,58,237)",
      "border-width": 2,
      color: "rgb(216,180,254)",
      "font-size": "11px",
      width: 110,
      height: 48,
    },
  },
  {
    selector: 'node[type="adr"]',
    style: {
      shape: "roundrectangle",
      "background-color": "rgb(26,20,0)",
      "border-color": "rgb(146,64,14)",
      color: "rgb(252,211,77)",
      "font-size": "10px",
      width: 80,
      height: 32,
    },
  },
  {
    selector: 'node[type="incident"]',
    style: {
      shape: "roundrectangle",
      "background-color": "rgb(26,5,5)",
      "border-color": "rgb(153,27,27)",
      color: "rgb(252,165,165)",
      "font-size": "10px",
      width: 80,
      height: 32,
    },
  },

  // ── Status overrides ──
  {
    selector: 'node[status="violation"]',
    style: {
      "border-color": "rgb(239,68,68)",
      "border-width": 2,
      "background-color": "rgb(26,5,5)",
      color: "rgb(252,165,165)",
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-width": 2,
      "border-color": "#6366f1",
      "overlay-opacity": 0,
    },
  },

  // ── Edge types ──
  {
    selector: 'edge[type="depends"]',
    style: {
      "line-color": "rgba(99,102,241,0.25)",
      "target-arrow-color": "rgba(99,102,241,0.35)",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.7,
      width: 1,
      opacity: 0.8,
    },
  },
  {
    selector: 'edge[type="violation"]',
    style: {
      "line-color": "rgb(239,68,68)",
      "target-arrow-color": "rgb(239,68,68)",
      "target-arrow-shape": "triangle",
      "line-style": "dashed",
      "line-dash-pattern": [6, 3],
      width: 2,
      label: "data(label)",
      color: "rgb(239,68,68)",
      "font-size": "9px",
      "text-background-color": "rgb(6,6,8)",
      "text-background-opacity": 1,
      "text-background-padding": "2px",
    },
  },
  {
    selector: 'edge[type="enforces"]',
    style: {
      "line-color": "rgb(168,85,247)",
      "target-arrow-color": "rgb(168,85,247)",
      "target-arrow-shape": "triangle",
      "line-style": "dotted",
      width: 1.5,
    },
  },
  {
    selector: 'edge[type="why"]',
    style: {
      "line-color": "rgb(245,158,11)",
      "target-arrow-color": "rgb(245,158,11)",
      "target-arrow-shape": "triangle",
      "line-style": "dashed",
      "line-dash-pattern": [4, 4],
      width: 1.5,
      label: "data(label)",
      color: "rgb(245,158,11)",
      "font-size": "8px",
      "text-background-color": "rgb(6,6,8)",
      "text-background-opacity": 1,
      "text-background-padding": "2px",
    },
  },
  {
    selector: 'edge[type="drift"]',
    style: {
      "line-color": "rgb(239,68,68)",
      "target-arrow-color": "rgb(239,68,68)",
      "target-arrow-shape": "triangle",
      "line-style": "dashed",
    },
  },

  // ── Selected edge ──
  {
    selector: "edge:selected",
    style: {
      "line-color": "rgba(99,102,241,0.6)",
      "target-arrow-color": "rgba(99,102,241,0.7)",
      width: 1.5,
    },
  },
];
