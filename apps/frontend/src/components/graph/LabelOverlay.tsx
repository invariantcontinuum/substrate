import { useEffect, useRef } from "react";
import type { GraphHandle } from "@invariantcontinuum/graph/react";
import type { GraphTheme } from "./styleAdapter";

export interface LabelOverlayProps {
  engineRef: React.RefObject<GraphHandle | null>;
  theme: GraphTheme;
  /** Ordered list of node ids matching the engine's internal positions buffer order.
   *  MUST match the order of `snapshot.nodes` passed to `<Graph>`. */
  nodeIds: string[];
  /** Map nodeId -> label text (e.g., node.name). */
  labels: Record<string, string>;
  /** Map nodeId -> type (drives per-type font/size/color). */
  nodeTypes: Record<string, string>;
  /** Below this zoom (from vpMatrix scale), labels are hidden to preserve FPS. */
  minZoomToShowLabels?: number;
  /** True once the `<Graph>` component signalled `onReady` — before this the
   *  engine ref's `subscribeFrame` is not yet wired up and subscribing will
   *  silently no-op, so we must gate the subscription on it. */
  ready: boolean;
}

interface FrameState {
  positions: Float32Array | null;
  vpMatrix: Float32Array | null;
}

interface FittedLabel {
  lines: string[];
  fontPx: number;
  lineHeight: number;
}

export function LabelOverlay({
  engineRef,
  theme,
  nodeIds,
  labels,
  nodeTypes,
  minZoomToShowLabels = 0.04,
  ready,
}: LabelOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<FrameState>({ positions: null, vpMatrix: null });
  const rafRef = useRef<number | null>(null);

  // Subscribe to engine frame updates. Gated on `ready` because the engine
  // ref is initially null and the `<Graph>` component only wires up the
  // frame subscription after its internal `init` effect has run.
  useEffect(() => {
    if (!ready) return;
    const engine = engineRef.current;
    if (!engine) return;
    const unsubscribe = engine.subscribeFrame(({ positions, vpMatrix }) => {
      frameRef.current = { positions, vpMatrix };
    });
    return unsubscribe;
  }, [engineRef, ready]);

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

      // `vpMatrix` is in normalized-device-coordinate space, not raw camera zoom.
      // For an ortho camera, converting the VP scale back into screen pixels
      // gives us the effective on-canvas zoom factor. Using the raw matrix term
      // directly made a normal zoom of ~1 look like ~0.002 on a 1000px canvas,
      // which suppressed labels almost all the time.
      const zoom =
        Math.hypot(vpMatrix[0], vpMatrix[1]) * 0.5 * cvs.width / dpr;
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
        const nodeW = Math.max(
          ((typeStyle.halfWidth ?? theme.defaultNodeStyle.halfWidth) * 2) * zoom * dpr,
          0,
        );
        const nodeH = Math.max(
          ((typeStyle.halfHeight ?? theme.defaultNodeStyle.halfHeight) * 2) * zoom * dpr,
          0,
        );
        if (nodeW < 14 * dpr || nodeH < 10 * dpr) continue;

        const padX = Math.min(7 * dpr, nodeW * 0.18);
        const padY = Math.min(5 * dpr, nodeH * 0.22);
        const boxW = nodeW - 2 * padX;
        const boxH = nodeH - 2 * padY;
        if (boxW < 8 * dpr || boxH < 6 * dpr) continue;

        const fontFamily = typeStyle.labelFont ?? "sans-serif";
        const fontWeight = typeStyle.labelWeight ?? 700;
        const baseFontPx = Math.min(
          Math.max((typeStyle.labelSize ?? 11) * zoom * dpr, 7 * dpr),
          22 * dpr,
        );
        const fitted = fitLabelInBox(
          ctx,
          labels[id] || "",
          boxW,
          boxH,
          fontFamily,
          fontWeight,
          baseFontPx,
          6 * dpr,
          dpr,
        );
        if (!fitted) continue;

        ctx.save();
        ctx.beginPath();
        ctx.rect(sx - nodeW * 0.5, sy - nodeH * 0.5, nodeW, nodeH);
        ctx.clip();

        ctx.font = `${fontWeight} ${fitted.fontPx}px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2 * dpr, fitted.fontPx * 0.26);
        ctx.strokeStyle = theme.canvasBg;
        ctx.fillStyle = typeStyle.labelColor ?? theme.defaultNodeStyle.labelColor;

        const startY = sy - ((fitted.lines.length - 1) * fitted.lineHeight) / 2;
        for (let li = 0; li < fitted.lines.length; li++) {
          const line = fitted.lines[li];
          const y = startY + li * fitted.lineHeight;
          ctx.strokeText(line, sx, y);
          ctx.fillText(line, sx, y);
        }
        ctx.restore();
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
        zIndex: 2,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
      }}
    />
  );
}

function fitLabelInBox(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  maxWidth: number,
  maxHeight: number,
  fontFamily: string,
  fontWeight: number,
  baseFontPx: number,
  minFontPx: number,
  dpr: number,
): FittedLabel | null {
  const text = normalizeLabel(rawText);
  if (!text) return null;

  const step = Math.max(0.5, 0.5 * dpr);
  for (let fontPx = baseFontPx; fontPx >= minFontPx - 0.01; fontPx -= step) {
    ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
    const lineHeight = Math.max(fontPx * 1.16, fontPx + 1 * dpr);
    const maxLines = Math.max(1, Math.min(4, Math.floor(maxHeight / lineHeight)));
    if (maxLines < 1) continue;
    const lines = wrapIntoLines(ctx, text, maxWidth, maxLines);
    if (lines.length === 0) continue;
    if (lines.length * lineHeight <= maxHeight + 0.5 * dpr) {
      return { lines, fontPx, lineHeight };
    }
  }

  ctx.font = `${fontWeight} ${minFontPx}px ${fontFamily}`;
  const lineHeight = Math.max(minFontPx * 1.16, minFontPx + 1 * dpr);
  if (lineHeight > maxHeight) return null;
  return {
    lines: [ellipsize(ctx, text, maxWidth)],
    fontPx: minFontPx,
    lineHeight,
  };
}

function wrapIntoLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let start = 0;

  while (start < chars.length && lines.length < maxLines) {
    const hardEnd = fitChars(ctx, chars, start, maxWidth);
    if (hardEnd <= start) break;
    let end = hardEnd;
    if (hardEnd < chars.length) {
      const softEnd = findSoftBreak(chars, start, hardEnd);
      if (softEnd > start + 1) end = softEnd;
    }

    const line = chars.slice(start, end).join("").trim();
    start = end;
    while (start < chars.length && chars[start] === " ") start++;
    if (!line) continue;
    lines.push(line);
  }

  if (!lines.length) return [];
  if (start < chars.length) {
    const remaining = chars.slice(start).join("").trim();
    const tail = remaining
      ? `${lines[lines.length - 1]} ${remaining}`
      : lines[lines.length - 1];
    lines[lines.length - 1] = ellipsize(ctx, tail, maxWidth);
  }
  return lines;
}

function fitChars(
  ctx: CanvasRenderingContext2D,
  chars: string[],
  start: number,
  maxWidth: number,
): number {
  let best = start;
  for (let i = start + 1; i <= chars.length; i++) {
    const chunk = chars.slice(start, i).join("");
    if (ctx.measureText(chunk).width > maxWidth) break;
    best = i;
  }
  return best;
}

function findSoftBreak(chars: string[], start: number, hardEnd: number): number {
  for (let i = hardEnd; i > start; i--) {
    if (isBreakChar(chars[i - 1])) return i;
  }
  return hardEnd;
}

function isBreakChar(ch: string): boolean {
  return ch === " " || ch === "/" || ch === "\\" || ch === "_" || ch === "-" || ch === "." || ch === ":";
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = "...";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ell;
}

function normalizeLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}
