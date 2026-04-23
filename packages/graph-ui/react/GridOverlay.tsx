import { useEffect, useRef } from "react";
import type { GraphHandle } from "./Graph";
import type { GraphTheme } from "./theme/types";
import { screenZoom } from "./overlays/vpMath";
import { useDprCanvas } from "./overlays/useDprCanvas";

export interface GridOverlayProps {
  engineRef: React.RefObject<GraphHandle | null>;
  theme: GraphTheme;
  ready: boolean;
}

export function GridOverlay({ engineRef, theme, ready }: GridOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<{ vp: Float32Array | null }>({ vp: null });
  const rafRef = useRef<number | null>(null);

  useDprCanvas(canvasRef);

  useEffect(() => {
    if (!ready) return;
    const engine = engineRef.current;
    if (!engine) return;
    const unsub = engine.subscribeFrame(({ vpMatrix }) => {
      frameRef.current.vp = vpMatrix;
    });
    return unsub;
  }, [engineRef, ready]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const BASE_GRID_PX = 50;

    const tick = () => {
      const ctx = cvs.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      const vp = frameRef.current.vp;
      if (!vp) { rafRef.current = requestAnimationFrame(tick); return; }

      const zoom = screenZoom(vp, cvs.width, dpr);
      const gridPx = Math.max(12 * dpr, Math.min(240 * dpr, BASE_GRID_PX * zoom * dpr));
      const originX = (vp[12] + 1) * 0.5 * cvs.width;
      const originY = (1 - vp[13]) * 0.5 * cvs.height;
      const offsetX = ((originX % gridPx) + gridPx) % gridPx;
      const offsetY = ((originY % gridPx) + gridPx) % gridPx;

      ctx.strokeStyle = theme.gridLineColor;
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let x = offsetX; x <= cvs.width; x += gridPx) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, cvs.height);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let y = offsetY; y <= cvs.height; y += gridPx) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(cvs.width, y + 0.5);
      }
      ctx.stroke();

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [theme.gridLineColor]);

  return (
    <canvas
      ref={canvasRef}
      className="graph-grid-overlay"
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", width: "100%", height: "100%" }}
    />
  );
}
