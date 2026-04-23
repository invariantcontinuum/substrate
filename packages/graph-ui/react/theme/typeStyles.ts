// Per-node-type shape + size table. Theme-independent — colors live in palette.ts.
// Values come from legacy Cytoscape stylesheet (commit 14d17f5~1) converted to
// half-dimensions (graph-ui uses halfWidth/halfHeight, legacy used width/height).

import type { NodeType } from "./palette";

export type Shape =
  | "roundrectangle" | "barrel" | "diamond"
  | "hexagon" | "octagon" | "triangle" | "square" | "circle";

export interface TypeShape {
  shape: Shape;
  halfWidth: number;
  halfHeight: number;
  cornerRadius: number;
  borderWidth: number;
  labelSize: number;
}

// Shared defaults: most types are 110x38 rounded rectangles with 11px labels.
const R_110_38: Omit<TypeShape, "shape"> = { halfWidth: 55, halfHeight: 19, cornerRadius: 8, borderWidth: 2.0, labelSize: 11 };
const R_90_34:  Omit<TypeShape, "shape"> = { halfWidth: 45, halfHeight: 17, cornerRadius: 8, borderWidth: 2.0, labelSize: 10 };

export const TYPE_STYLES: Record<NodeType, TypeShape> = {
  service:  { shape: "roundrectangle", ...R_110_38 },
  source:   { shape: "roundrectangle", ...R_110_38 },
  data:     { shape: "roundrectangle", ...R_110_38 },
  config:   { shape: "roundrectangle", ...R_110_38 },
  script:   { shape: "roundrectangle", ...R_110_38 },
  doc:      { shape: "roundrectangle", ...R_110_38 },
  asset:    { shape: "roundrectangle", ...R_110_38 },
  database: { shape: "barrel",         ...R_110_38 },
  cache:    { shape: "barrel",         ...R_110_38 },
  policy:   { shape: "diamond",        halfWidth: 55, halfHeight: 24, cornerRadius: 8, borderWidth: 2.5, labelSize: 11 },
  adr:      { shape: "roundrectangle", ...R_90_34 },
  incident: { shape: "roundrectangle", halfWidth: 45, halfHeight: 17, cornerRadius: 8, borderWidth: 2.5, labelSize: 10 },
  external: { shape: "roundrectangle", halfWidth: 50, halfHeight: 17, cornerRadius: 8, borderWidth: 2.0, labelSize: 10 },
};

export const DEFAULT_STYLE: TypeShape = {
  shape: "roundrectangle",
  halfWidth: 55,
  halfHeight: 19,
  cornerRadius: 8,
  borderWidth: 1.8,
  labelSize: 11,
};

export function typeStyleFor(type: string | undefined | null): TypeShape {
  if (!type) return DEFAULT_STYLE;
  return (TYPE_STYLES as Record<string, TypeShape | undefined>)[type] ?? DEFAULT_STYLE;
}
