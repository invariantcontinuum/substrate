// Compose a `GraphTheme` from `palette x typeStyles`.
// Glass-pane rule is enforced here — every node type reads its fill from
// `palette.nodeGlassFill`, so a reviewer can see the uniform rule at a glance.

import type { GraphTheme, NodeTypeStyle, EdgeTypeStyle } from "./types";
import { LIGHT, DARK, NODE_TYPES, EDGE_TYPES, type EdgeType } from "./palette";
import { TYPE_STYLES, DEFAULT_STYLE } from "./typeStyles";

const LABEL_FONT = "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif";
const LABEL_WEIGHT = 700;

const EDGE_TYPE_LINE_WIDTH: Record<EdgeType, number> = {
  depends:    1.7,
  depends_on: 1.7,
  violation:  2.6,
  enforces:   1.9,
  why:        1.9,
  drift:      1.5,
};

const EDGE_TYPE_STYLE: Record<EdgeType, EdgeTypeStyle["style"]> = {
  depends:    "solid",
  depends_on: "solid",
  violation:  "dashed",
  enforces:   "dotted",
  why:        "short-dashed",
  drift:      "dashed",
};

export function buildGraphTheme(mode: "light" | "dark"): GraphTheme {
  const p = mode === "light" ? LIGHT : DARK;

  const nodeTypes: Record<string, NodeTypeStyle> = {};
  for (const type of NODE_TYPES) {
    const shape = TYPE_STYLES[type];
    nodeTypes[type] = {
      shape: shape.shape,
      halfWidth: shape.halfWidth,
      halfHeight: shape.halfHeight,
      cornerRadius: shape.cornerRadius,
      color: p.nodeGlassFill,
      borderColor: p.typeBorders[type],
      borderWidth: shape.borderWidth,
      labelColor: p.labelColor,
      labelFont: LABEL_FONT,
      labelSize: shape.labelSize,
      labelWeight: LABEL_WEIGHT,
    };
  }

  const edgeTypes: Record<string, EdgeTypeStyle> = {};
  for (const type of EDGE_TYPES) {
    edgeTypes[type] = {
      color: p.edgeAccents[type].line,
      width: EDGE_TYPE_LINE_WIDTH[type],
      style: EDGE_TYPE_STYLE[type],
      arrow: "triangle",
    };
  }

  const defaultNodeStyle: NodeTypeStyle = {
    shape: DEFAULT_STYLE.shape,
    halfWidth: DEFAULT_STYLE.halfWidth,
    halfHeight: DEFAULT_STYLE.halfHeight,
    cornerRadius: DEFAULT_STYLE.cornerRadius,
    color: p.nodeGlassFill,
    borderColor: p.nodeDefaultBorder,
    borderWidth: DEFAULT_STYLE.borderWidth,
    labelColor: p.labelColor,
    labelFont: LABEL_FONT,
    labelSize: DEFAULT_STYLE.labelSize,
    labelWeight: LABEL_WEIGHT,
  };

  const defaultEdgeStyle: EdgeTypeStyle = {
    color: p.edgeDefault,
    width: 1.3,
    style: "solid",
    arrow: "triangle",
  };

  return {
    canvasBg: p.canvasBg,
    gridLineColor: p.gridLine,
    selectionBorder: p.selection,
    selectionFill: mode === "dark"
      ? "rgba(243, 223, 162, 0.24)"
      : "rgba(28, 85, 78, 0.16)",
    hullFill: p.hullFill,
    hullStroke: p.hullStroke,
    dimOpacity: 0.28,
    labelHalo: p.labelHalo,
    dimText: p.dimText,
    nodeTypes,
    edgeTypes,
    defaultNodeStyle,
    defaultEdgeStyle,
  };
}
