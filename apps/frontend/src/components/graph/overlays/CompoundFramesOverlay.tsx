import { useEffect, useRef } from "react";
import type { GraphHandle } from "@invariantcontinuum/graph/react";
import type { GraphTheme } from "../theme/types";
import { typeStyleFor } from "../theme/typeStyles";
import { worldToScreen } from "./vpMath";
import { useDprCanvas } from "./useDprCanvas";

export interface CompoundFramesOverlayProps {
  engineRef: React.RefObject<GraphHandle | null>;
  theme: GraphTheme;
  ready: boolean;
  nodeIds: string[];
  nodeSourceIds: Record<string, string | null>;
  nodeTypes: Record<string, string>;
  sourceLabels: Record<string, string>;
}

interface AABB { minX: number; minY: number; maxX: number; maxY: number; }

export function CompoundFramesOverlay({
  engineRef, theme, ready, nodeIds, nodeSourceIds, nodeTypes, sourceLabels,
}: CompoundFramesOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{ positions: Float32Array | null; vp: Float32Array | null }>({
    positions: null, vp: null,
  });
  const rafRef = useRef<number | null>(null);

  useDprCanvas(canvasRef);

  useEffect(() => {
    if (!ready) return;
    const engine = engineRef.current;
    if (!engine) return;
    const unsub = engine.subscribeFrame(({ positions, vpMatrix }) => {
      stateRef.current.positions = positions;
      stateRef.current.vp = vpMatrix;
    });
    return unsub;
  }, [engineRef, ready]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const tick = () => {
      const ctx = cvs.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      const { positions, vp } = stateRef.current;
      if (!positions || !vp) { rafRef.current = requestAnimationFrame(tick); return; }

      const boxes = new Map<string, AABB>();
      for (let i = 0; i < nodeIds.length; i++) {
        const id = nodeIds[i];
        const src = nodeSourceIds[id];
        if (!src) continue;
        const off = i * 4;
        if (off + 1 >= positions.length) break;
        const wx = positions[off];
        const wy = positions[off + 1];
        const style = typeStyleFor(nodeTypes[id]);
        const existing = boxes.get(src) ?? { minX: +Infinity, minY: +Infinity, maxX: -Infinity, maxY: -Infinity };
        existing.minX = Math.min(existing.minX, wx - style.halfWidth);
        existing.minY = Math.min(existing.minY, wy - style.halfHeight);
        existing.maxX = Math.max(existing.maxX, wx + style.halfWidth);
        existing.maxY = Math.max(existing.maxY, wy + style.halfHeight);
        boxes.set(src, existing);
      }

      ctx.strokeStyle = theme.hullStroke;
      ctx.fillStyle   = theme.hullFill;
      ctx.lineWidth   = 1;
      ctx.setLineDash([6, 4]);

      for (const [src, box] of boxes) {
        const tl = worldToScreen(box.minX, box.minY, vp, cvs.width, cvs.height);
        const br = worldToScreen(box.maxX, box.maxY, vp, cvs.width, cvs.height);
        const PAD = 24;
        const rx = Math.min(tl.sx, br.sx) - PAD;
        const ry = Math.min(tl.sy, br.sy) - PAD;
        const w  = Math.abs(br.sx - tl.sx) + PAD * 2;
        const h  = Math.abs(br.sy - tl.sy) + PAD * 2;
        const r  = 12;
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.lineTo(rx + w - r, ry); ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
        ctx.lineTo(rx + w,     ry + h - r); ctx.quadraticCurveTo(rx + w, ry + h, rx + w - r, ry + h);
        ctx.lineTo(rx + r,     ry + h); ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - r);
        ctx.lineTo(rx,         ry + r); ctx.quadraticCurveTo(rx, ry, rx + r, ry);
        ctx.fill();
        ctx.stroke();

        const label = sourceLabels[src] ?? src.slice(0, 8);
        ctx.font = "500 10px 'Manrope', sans-serif";
        ctx.fillStyle = theme.dimText;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.setLineDash([]);
        ctx.fillText(label, rx + 8, ry - 4);
        ctx.setLineDash([6, 4]);
      }

      ctx.setLineDash([]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [theme, nodeIds, nodeSourceIds, nodeTypes, sourceLabels]);

  return (
    <canvas
      ref={canvasRef}
      className="graph-compound-frames-overlay"
      style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none", width: "100%", height: "100%" }}
    />
  );
}
