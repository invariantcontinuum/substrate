// Convert a pure `GraphTheme` into the `ThemeConfig` JSON the engine's
// `RenderEngine.set_theme(js_value)` accepts.
//
// CRITICAL: every field in Rust `ThemeConfig` uses `#[serde(rename = "camelCase")]`
// (halfWidth, borderColor, byType, dimOpacity, etc.). Emitting snake_case makes
// serde silently ignore the key and fall back to defaults. Guarded by
// `toEngineTheme.test.ts`.

import type { GraphTheme, NodeTypeStyle, EdgeTypeStyle } from "./types";

function toNodeStyleFull(s: NodeTypeStyle) {
  return {
    shape: s.shape,
    size: Math.max(s.halfWidth, s.halfHeight),
    halfWidth: s.halfWidth,
    halfHeight: s.halfHeight,
    cornerRadius: s.cornerRadius,
    color: s.color,
    borderWidth: s.borderWidth,
    borderColor: s.borderColor,
  };
}

function toNodeOverride(s: NodeTypeStyle) {
  return {
    shape: s.shape,
    size: Math.max(s.halfWidth, s.halfHeight),
    halfWidth: s.halfWidth,
    halfHeight: s.halfHeight,
    cornerRadius: s.cornerRadius,
    color: s.color,
    borderWidth: s.borderWidth,
    borderColor: s.borderColor,
  };
}

function toEdgeStyleFull(s: EdgeTypeStyle) {
  return { color: s.color, width: s.width, arrow: s.arrow };
}

function toEdgeOverride(s: EdgeTypeStyle) {
  return { color: s.color, width: s.width, style: s.style };
}

export function graphThemeToEngineJson(t: GraphTheme): unknown {
  const byTypeNodes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t.nodeTypes)) byTypeNodes[k] = toNodeOverride(v);
  const byTypeEdges: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(t.edgeTypes)) byTypeEdges[k] = toEdgeOverride(v);

  return {
    // Transparent so the underlying GridOverlay paints through.
    background: "rgba(0, 0, 0, 0)",
    nodes: {
      default: toNodeStyleFull(t.defaultNodeStyle),
      byType: byTypeNodes,
      byStatus: {
        violation: { borderColor: "#e6706b", borderWidth: 2.6, pulse: true },
        drift:     { borderColor: "#e8aa99", borderWidth: 2.0, pulse: true },
      },
    },
    edges: {
      default: toEdgeStyleFull(t.defaultEdgeStyle),
      byType: byTypeEdges,
    },
    communities: { hull: false, hullOpacity: 0.15 },
    interaction: {
      select: { borderColor: t.selectionBorder, borderWidth: 3.0 },
      spotlight: { dimOpacity: t.dimOpacity, transitionMs: 400 },
    },
  };
}
