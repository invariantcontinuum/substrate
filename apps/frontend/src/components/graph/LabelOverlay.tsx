import { useEffect, useRef } from "react";
import type { GraphHandle } from "@invariantcontinuum/graph/react";
import type { GraphTheme } from "./styleAdapter";

export interface LabelOverlayProps {
  engineRef: React.RefObject<GraphHandle>;
  theme: GraphTheme;
  /** Ordered list of node ids matching the engine's internal positions buffer order.
   *  MUST be the same array the parent passed to `engine.set_node_ids(...)`. */
  nodeIds: string[];
  /** Map nodeId -> label text (e.g., node.name). */
  labels: Record<string, string>;
  /** Map nodeId -> type (drives per-type font/size/color). */
  nodeTypes: Record<string, string>;
  /** Below this zoom (from vpMatrix scale), labels are hidden to preserve FPS. */
  minZoomToShowLabels?: number;
}

interface FrameState {
  positions: Float32Array | null;
  vpMatrix: Float32Array | null;
}

export function LabelOverlay({
  engineRef,
  theme,
  nodeIds,
  labels,
  nodeTypes,
  minZoomToShowLabels = 0.25,
}: LabelOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<FrameState>({ positions: null, vpMatrix: null });
  const rafRef = useRef<number | null>(null);

  // Subscribe to engine frame updates.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const unsubscribe = engine.subscribeFrame(({ positions, vpMatrix }) => {
      frameRef.current = { positions, vpMatrix };
    });
    return unsubscribe;
  }, [engineRef]);

  // Render loop.
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      cvs.width = cvs.clientWidth * dpr;
      cvs.height = cvs.clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cvs);

    const tick = () => {
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      const { positions, vpMatrix } = frameRef.current;
      if (!positions || !vpMatrix) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Effective zoom from the VP matrix (scale factor on x axis column).
      const zoom = Math.hypot(vpMatrix[0], vpMatrix[1]);
      if (zoom < minZoomToShowLabels) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Iterate engine-ordered ids. positions stride-4: [x, y, radius, type_idx].
      for (let i = 0; i < nodeIds.length; i++) {
        const id = nodeIds[i];
        const off = i * 4;
        if (off + 1 >= positions.length) break; // defensive: ids longer than positions
        const wx = positions[off];
        const wy = positions[off + 1];

        // world -> NDC via 4x4 column-major VP matrix (z=0, w=1)
        const cx = vpMatrix[0] * wx + vpMatrix[4] * wy + vpMatrix[12];
        const cy = vpMatrix[1] * wx + vpMatrix[5] * wy + vpMatrix[13];

        // NDC -> screen (y-flip because canvas y=0 is top)
        const sx = (cx + 1) * 0.5 * cvs.width;
        const sy = (1 - cy) * 0.5 * cvs.height;

        // Viewport cull with 200px margin.
        if (sx < -200 || sx > cvs.width + 200) continue;
        if (sy < -200 || sy > cvs.height + 200) continue;

        const type = nodeTypes[id] ?? "";
        const typeStyle = theme.nodeTypes[type] ?? theme.defaultNodeStyle;
        const fontSize = (typeStyle.labelSize ?? 11) * dpr;
        const fontFamily = typeStyle.labelFont ?? "sans-serif";
        const fontWeight = typeStyle.labelWeight ?? 700;
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const label = labels[id] || "";
        const maxW = ((typeStyle.halfWidth ?? 55) * 2 - 16) * zoom * dpr;
        const text = truncate(ctx, label, maxW);

        // Text outline (stroke in canvas bg color for contrast on grid).
        ctx.lineWidth = 3 * dpr;
        ctx.strokeStyle = theme.canvasBg;
        ctx.strokeText(text, sx, sy);
        ctx.fillStyle = typeStyle.labelColor ?? theme.defaultNodeStyle.labelColor;
        ctx.fillText(text, sx, sy);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [nodeIds, labels, nodeTypes, theme, minZoomToShowLabels]);

  return (
    <canvas
      ref={canvasRef}
      className="graph-label-overlay"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
      }}
    />
  );
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = "…";
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ell;
}
