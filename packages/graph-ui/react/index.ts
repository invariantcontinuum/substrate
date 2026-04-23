// WASM/WebGL2 engine entry point.
export { Graph } from "./Graph";
export type { GraphProps, GraphHandle } from "./Graph";

// High-level composite — drop-in scene with every overlay wired up.
export { GraphScene } from "./GraphScene";
export type { GraphSceneProps, ThemeMode } from "./GraphScene";

// Individual overlays — exported so apps that need custom composition can
// still pick the parts they want.
export { GridOverlay } from "./GridOverlay";
export type { GridOverlayProps } from "./GridOverlay";
export { CompoundFramesOverlay } from "./CompoundFramesOverlay";
export type { CompoundFramesOverlayProps } from "./CompoundFramesOverlay";
export { LabelOverlay } from "./LabelOverlay";
export type { LabelOverlayProps } from "./LabelOverlay";
export { EdgeLabelsOverlay } from "./EdgeLabelsOverlay";
export type { EdgeLabelsOverlayProps } from "./EdgeLabelsOverlay";

// Theme system — frontends that need to read colors (e.g., for a legend or
// sidebar) build their own GraphTheme via `buildGraphTheme(mode)`.
export { buildGraphTheme } from "./theme/buildTheme";
export { graphThemeToEngineJson } from "./theme/toEngineTheme";
export { typeStyleFor, TYPE_STYLES, DEFAULT_STYLE } from "./theme/typeStyles";
export type { TypeShape, Shape } from "./theme/typeStyles";
export { LIGHT, DARK, NODE_TYPES, EDGE_TYPES } from "./theme/palette";
export type { Palette, NodeType, EdgeType, EdgeAccent } from "./theme/palette";
export type { GraphTheme, NodeTypeStyle, EdgeTypeStyle } from "./theme/types";

// Raw engine types.
export type {
  NodeData,
  EdgeData,
  GraphSnapshot,
  GraphStats,
  GraphFilter,
  LayoutType,
  LegendEntry,
  LegendSummary,
} from "./types";
