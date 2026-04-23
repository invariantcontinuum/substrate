import { useEffect, useRef } from "react";
import type { GraphHandle } from "./Graph";
import type { GraphTheme } from "./theme/types";
import { worldToScreen, bitKey } from "./overlays/vpMath";
import { useDprCanvas } from "./overlays/useDprCanvas";

// Matches ThemeConfig's edge byType index order. Keep in sync with the Rust side.
const EDGE_TYPE_NAMES: Record<number, string> = {
  0: "depends", 1: "violation", 2: "enforces", 3: "why", 4: "drift",
};

export interface EdgeLabelsOverlayProps {
  engineRef: React.RefObject<GraphHandle | null>;
  theme: GraphTheme;
  ready: boolean;
}

export function EdgeLabelsOverlay({ engineRef, theme, ready }: EdgeLabelsOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    edgeData: Float32Array | null;
    focusIdx: number;
    positions: Float32Array | null;
    vp: Float32Array | null;
  }>({ edgeData: null, focusIdx: -1, positions: null, vp: null });
  const rafRef = useRef<number | null>(null);

  useDprCanvas(canvasRef);

  useEffect(() => {
    if (!ready) return;
    const engine = engineRef.current;
    if (!engine) return;
    const unsubEdges = engine.subscribeEdges(({ edgeData, focusIdx }) => {
      stateRef.current.edgeData = edgeData;
      stateRef.current.focusIdx = focusIdx;
    });
    const unsubFrame = engine.subscribeFrame(({ positions, vpMatrix }) => {
      stateRef.current.positions = positions;
      stateRef.current.vp = vpMatrix;
    });
    return () => { unsubEdges(); unsubFrame(); };
  }, [engineRef, ready]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const tick = () => {
      const ctx = cvs.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      const { edgeData, focusIdx, positions, vp } = stateRef.current;
      if (focusIdx < 0 || !edgeData || !positions || !vp) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const focusOff = focusIdx * 4;
      if (focusOff + 1 >= positions.length) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const focusKey = bitKey(positions[focusOff], positions[focusOff + 1]);

      ctx.font = "600 10px 'Manrope', sans-serif";
      for (let i = 0; i + 6 <= edgeData.length; i += 6) {
        const sx = edgeData[i], sy = edgeData[i + 1], tx = edgeData[i + 2], ty = edgeData[i + 3];
        const sKey = bitKey(sx, sy);
        const tKey = bitKey(tx, ty);
        if (sKey !== focusKey && tKey !== focusKey) continue;

        const typeIdx = Math.floor(edgeData[i + 4]);
        const label = EDGE_TYPE_NAMES[typeIdx] ?? "";
        if (!label) continue;

        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const { sx: screenX, sy: screenY } = worldToScreen(mx, my, vp, cvs.width, cvs.height);

        const pad = 5;
        const w = ctx.measureText(label).width + pad * 2;
        const h = 16;
        ctx.fillStyle = theme.hullFill;
        ctx.strokeStyle = theme.hullStroke;
        ctx.lineWidth = 1;
        const rx = screenX - w / 2, ry = screenY - h / 2;
        const r = 3;
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + w - r, ry); ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
        ctx.lineTo(rx + w,     ry + h - r); ctx.quadraticCurveTo(rx + w, ry + h, rx + w - r, ry + h);
        ctx.lineTo(rx + r,     ry + h); ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - r);
        ctx.lineTo(rx,         ry + r); ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = theme.defaultNodeStyle.labelColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, screenX, screenY);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="graph-edge-labels-overlay"
      style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none", width: "100%", height: "100%" }}
    />
  );
}
