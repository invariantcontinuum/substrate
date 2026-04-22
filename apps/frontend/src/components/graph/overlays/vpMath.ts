// Pure helpers for overlay canvases that subscribe to the engine's vpMatrix.
// All overlays (GridOverlay, CompoundFramesOverlay, EdgeLabelsOverlay,
// LabelOverlay) rely on these — DRY single source of truth for the world <-> screen
// transform.

/** Project world-space (wx, wy, z=0, w=1) through a column-major 4x4 VP matrix
 *  onto canvas pixel coordinates (y flipped because canvas origin is top-left). */
export function worldToScreen(
  wx: number,
  wy: number,
  vp: Float32Array,
  canvasWidth: number,
  canvasHeight: number,
): { sx: number; sy: number } {
  const cx = vp[0] * wx + vp[4] * wy + vp[12];
  const cy = vp[1] * wx + vp[5] * wy + vp[13];
  return {
    sx: (cx + 1) * 0.5 * canvasWidth,
    sy: (1 - cy) * 0.5 * canvasHeight,
  };
}

/** Approximate effective screen-space zoom from an orthographic VP matrix.
 *  Used to scale grid squares, node sizes at label time, and dash periods. */
export function screenZoom(vp: Float32Array, canvasWidth: number, dpr: number): number {
  return Math.hypot(vp[0], vp[1]) * 0.5 * canvasWidth / dpr;
}

// Shared scratch buffer for bitKey so we don't allocate per call.
const _u32 = new Uint32Array(2);
const _f32 = new Float32Array(_u32.buffer);

/** Pack two f32s into a single JS number that uniquely identifies the pair
 *  at the bit level. Collision-free because f32 values round-trip byte-
 *  identical across the worker boundary (Float32Array preserves bits).
 *  JavaScript Numbers are f64 — safe to pack two u32s into the mantissa. */
export function bitKey(x: number, y: number): number {
  _f32[0] = x;
  _f32[1] = y;
  return _u32[0] * 0x1_0000_0000 + _u32[1];
}
