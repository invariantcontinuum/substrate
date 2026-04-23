import { useEffect, useRef } from "react";
import type { GraphHandle } from "./Graph";
import type { GraphTheme } from "./theme/types";
import { fitLabelInBox } from "./overlays/labels/fitLabel";
import { worldToScreen, screenZoom } from "./overlays/vpMath";
import { useDprCanvas } from "./overlays/useDprCanvas";

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
  /** When set, nodes NOT in this set are rendered with reduced label alpha so
   *  they don't visually compete with the focused 1-hop neighborhood. The
   *  WASM shader already dims the node fills via `u_dim_opacity` when the
   *  engine has a focus, but the Canvas2D label overlay runs in a separate
   *  paint pipe — without this hint, fully-dimmed nodes still have bright,
   *  legible labels sitting on top, which makes the whole spotlight feature
   *  read as "weak" compared to legacy Cytoscape. Pass `null` or empty set
   *  to keep the pre-spotlight uniform brightness. */
  focusIds?: Set<string> | null;
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
  minZoomToShowLabels = 0.04,
  ready,
  focusIds,
}: LabelOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<FrameState>({ positions: null, vpMatrix: null });
  const rafRef = useRef<number | null>(null);

  useDprCanvas(canvasRef);

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

    const tick = () => {
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      const { positions, vpMatrix } = frameRef.current;
      if (!positions || !vpMatrix) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const zoom = screenZoom(vpMatrix, cvs.width, dpr);
      if (zoom < minZoomToShowLabels) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Iterate engine-ordered ids. positions stride-4: [x, y, radius, type_idx].
      for (let i = 0; i < nodeIds.length; i++) {
        const id = nodeIds[i];
        const off = i * 4;
        if (off + 1 >= positions.length) break;
        const wx = positions[off];
        const wy = positions[off + 1];

        const { sx, sy } = worldToScreen(wx, wy, vpMatrix, cvs.width, cvs.height);

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
        // Lower thresholds so labels also render at fit zoom (774 nodes on a
        // 1268-wide viewport compute to ~28x10 px per node — the prior 14x10
        // threshold skipped every label at first paint). Below these limits
        // the truncated label becomes unreadable and we'd just be drawing
        // noise, so we still bail.
        if (nodeW < 10 * dpr || nodeH < 5 * dpr) continue;

        // Keep padding tiny in both axes. boxH is the tight constraint at fit
        // zoom (node height ~8 px after grid × fit scaling), so we prefer
        // more glyph room over a roomy border.
        const padX = Math.min(3 * dpr, nodeW * 0.1);
        const padY = Math.min(1 * dpr, nodeH * 0.1);
        const boxW = nodeW - 2 * padX;
        const boxH = nodeH - 2 * padY;
        if (boxW < 6 * dpr || boxH < 4 * dpr) continue;

        const fontFamily = typeStyle.labelFont ?? "sans-serif";
        const fontWeight = typeStyle.labelWeight ?? 700;
        // Minimum font floor of 5 px so labels still render at the fit zoom
        // level (where boxH can be 5-7 px). Lower floor would degenerate into
        // unreadable rasterization; higher floor re-introduces the "no labels
        // at fit zoom" bug because the line-height wouldn't fit boxH.
        const baseFontPx = Math.min(
          Math.max((typeStyle.labelSize ?? 11) * zoom * dpr, 5 * dpr),
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
          5 * dpr,
          dpr,
        );
        if (!fitted) continue;

        ctx.save();
        ctx.beginPath();
        ctx.rect(sx - nodeW * 0.5, sy - nodeH * 0.5, nodeW, nodeH);
        ctx.clip();

        // Labels stay visible for every node at all times — matches legacy
        // Cytoscape behaviour. The WASM shader dims non-focus node FILLS
        // under spotlight, but labels are the information layer: users
        // need them legible when scanning "where is the neighbor I care
        // about?" across a dense grid. The previous 0.12-alpha dim on
        // non-focus labels made the 1-hop neighborhood unreadable at any
        // zoom level where focus-fit didn't re-frame (i.e. every click).
        // `focusIds` is still accepted so callers can opt in to per-focus
        // label styling in the future.
        void focusIds;

        ctx.font = `${fontWeight} ${fitted.fontPx}px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(2 * dpr, fitted.fontPx * 0.26);
        ctx.strokeStyle = theme.labelHalo ?? theme.canvasBg;
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
    };
  }, [nodeIds, labels, nodeTypes, theme, minZoomToShowLabels, focusIds]);

  return (
    <canvas
      ref={canvasRef}
      className="graph-label-overlay"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 4,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
      }}
    />
  );
}
