import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import type {
  GraphSnapshot,
  GraphFilter,
  GraphStats,
  LayoutType,
  NodeData,
  WorkerOutMessage,
  LegendSummary,
} from "./types";

export interface GraphProps {
  snapshotUrl?: string;
  wsUrl?: string;
  snapshot?: GraphSnapshot;
  theme?: Record<string, unknown>;
  layout?: LayoutType;
  filter?: GraphFilter | null;
  onNodeClick?: (node: NodeData) => void;
  onNodeHover?: (node: NodeData | null) => void;
  onLegendChange?: (legend: LegendSummary) => void;
  onStatsChange?: (stats: GraphStats) => void;
  onReady?: () => void;
  spotlightIds?: string[] | null;
  showCommunities?: boolean;
  className?: string;
  style?: React.CSSProperties;
  authToken?: string;
}

export interface GraphHandle {
  fit: (padding?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  relayout: (layout: LayoutType) => void;
  setTheme: (theme: unknown) => void;
  setData: (snapshot: GraphSnapshot) => void;
  selectNode: (id: string | null) => void;
  subscribeFrame: (
    cb: (m: { positions: Float32Array; vpMatrix: Float32Array }) => void,
  ) => () => void;
}

export const Graph = forwardRef<GraphHandle, GraphProps>(function Graph(
  {
    snapshotUrl,
    wsUrl,
    snapshot,
    theme,
    layout = "force",
    filter,
    onNodeClick,
    onNodeHover,
    onLegendChange,
    onStatsChange,
    onReady,
    spotlightIds,
    showCommunities = false,
    className,
    style,
    authToken,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<any>(null);
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number>(0);
  const convergedRef = useRef(false);
  const callbacksRef = useRef({ onNodeClick, onNodeHover, onStatsChange, onLegendChange });
  const draggingNodeRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  callbacksRef.current = { onNodeClick, onNodeHover, onStatsChange, onLegendChange };

  // Initialize engine and worker
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const mainWasm = await import("../graph_main_wasm.js");
      await mainWasm.default();
      if (cancelled) return;

      const engine = new mainWasm.RenderEngine(canvas);
      engineRef.current = engine;

      const worker = new Worker(
        new URL("./worker.ts", import.meta.url),
        { type: "module" }
      );
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        if (cancelled) return;
        const msg = e.data;

        if (msg.type === "positions") {
          const positions = new Float32Array(msg.positions);
          const flags = new Uint8Array(msg.flags);
          engine.update_positions(positions, flags);
          // Always request a paint. For force (non-converged) this keeps the
          // simulation visibly advancing; for grid / hierarchical (converged)
          // this is the one-and-only chance to paint the final positions.
          requestRender();
        } else if (msg.type === "edges") {
          const edges = new Float32Array(msg.edges);
          engine.update_edges(edges, msg.edge_count);
          requestRender();
        } else if (msg.type === "snapshot_loaded") {
          callbacksRef.current.onStatsChange?.({
            nodeCount: msg.node_count,
            edgeCount: msg.edge_count,
            violationCount: 0,
            lastUpdated: new Date().toISOString(),
          });
          const legend = engineRef.current?.get_legend();
          if (legend && callbacksRef.current.onLegendChange) {
            callbacksRef.current.onLegendChange(legend as LegendSummary);
          }
        } else if (msg.type === "stats") {
          callbacksRef.current.onStatsChange?.({
            nodeCount: msg.node_count,
            edgeCount: msg.edge_count,
            violationCount: msg.violation_count,
            lastUpdated: msg.last_updated,
          });
        } else if (msg.type === "converged") {
          convergedRef.current = true;
        }
      };

      worker.onerror = (e) => {
        console.error("Graph worker error:", e);
      };

      function renderLoop(timestamp: number) {
        if (cancelled) return;
        engine.frame(timestamp);
        if (engine.needs_frame()) {
          rafRef.current = requestAnimationFrame(renderLoop);
        } else {
          rafRef.current = 0;
        }
      }
      rafRef.current = requestAnimationFrame(renderLoop);

      // Signal ready — this triggers prop-sync effects
      setReady(true);
      onReady?.();
    }

    function requestRender() {
      engineRef.current?.request_render();
      if (rafRef.current === 0 && engineRef.current) {
        function loop(timestamp: number) {
          if (!engineRef.current) return;
          engineRef.current.frame(timestamp);
          if (engineRef.current.needs_frame()) {
            rafRef.current = requestAnimationFrame(loop);
          } else {
            rafRef.current = 0;
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      }
    }

    init().catch((err) => console.error("Graph init failed:", err));

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      workerRef.current?.terminate();
      engineRef.current = null;
      workerRef.current = null;
    };
  }, []);

  // Helper: load a snapshot via worker + engine metadata. Used by both the
  // `snapshot` prop effect and the imperative `setData` handle method.
  const applySnapshot = useCallback((snap: GraphSnapshot) => {
    if (!workerRef.current) return;
    convergedRef.current = false;

    if (snap.nodes.length === 0 && snap.edges.length === 0) {
      workerRef.current.postMessage({ type: "clear_snapshot" });
      return;
    }

    // Feed node metadata to the engine synchronously so it can resolve theme styles.
    if (engineRef.current) {
      try {
        engineRef.current.set_node_metadata(
          snap.nodes.map((n) => n.id),
          snap.nodes.map((n) => n.type),
          snap.nodes.map((n) => n.status),
        );
      } catch (e) {
        console.error("set_node_metadata failed:", e);
      }
    }

    workerRef.current.postMessage({
      type: "load_snapshot",
      nodes: snap.nodes,
      edges: snap.edges,
    });
  }, []);

  // Layout — MUST run BEFORE the snapshot effects. React fires effects in
  // declaration order, which is the same order the worker receives messages.
  // When snapshot loads before layout, the worker runs its default (force)
  // layout on the new nodes, then receives `set_layout=grid` but load_snapshot
  // has already populated positions — a subsequent snapshot/relayout is then
  // required. Keeping layout first guarantees the worker's active_layout is
  // `grid` when load_snapshot arrives, so positions are final on first paint.
  useEffect(() => {
    if (!ready || !workerRef.current) return;
    convergedRef.current = false;
    workerRef.current.postMessage({ type: "set_layout", layout });
  }, [ready, layout]);

  // Load snapshot from URL
  useEffect(() => {
    if (!ready || !snapshotUrl || !workerRef.current) return;
    fetch(snapshotUrl)
      .then((res) => res.json())
      .then((data) => {
        applySnapshot(data as GraphSnapshot);
      })
      .catch((err) => console.error("Snapshot fetch failed:", err));
  }, [ready, snapshotUrl, applySnapshot]);

  // Load snapshot from prop
  useEffect(() => {
    if (!ready || !snapshot) return;
    applySnapshot(snapshot);
  }, [ready, snapshot, applySnapshot]);

  // WebSocket
  useEffect(() => {
    if (!ready || !wsUrl || !authToken || !workerRef.current) return;
    workerRef.current.postMessage({
      type: "connect_ws",
      url: wsUrl,
      token: authToken,
    });
  }, [ready, wsUrl, authToken]);

  // Theme
  useEffect(() => {
    if (!ready || !theme || !engineRef.current) return;
    engineRef.current.set_theme(theme);
  }, [ready, theme]);

  // Filter
  useEffect(() => {
    if (!ready || !workerRef.current) return;
    workerRef.current.postMessage({
      type: "set_filter",
      filter: filter ?? null,
    });
  }, [ready, filter]);

  // Spotlight
  useEffect(() => {
    if (!ready || !workerRef.current) return;
    workerRef.current.postMessage({
      type: "set_spotlight",
      ids: spotlightIds ?? null,
    });
  }, [ready, spotlightIds]);

  // Community hulls
  useEffect(() => {
    if (!ready || !engineRef.current || !workerRef.current) return;
    engineRef.current.set_community_hulls(showCommunities);
    workerRef.current.postMessage({
      type: "set_communities",
      show: showCommunities,
    });
  }, [ready, showCommunities]);

  // Native non-passive wheel listener — React's onWheel prop is passive since React 17,
  // so e.preventDefault() inside it is a no-op. Attach directly to the canvas with
  // { passive: false } so ctrl+wheel zoom stays inside the graph canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      engineRef.current?.handle_zoom(
        e.deltaY,
        (e.clientX - rect.left) * dpr,
        (e.clientY - rect.top) * dpr
      );
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, []);

  const pumpWorkerMessages = useCallback(() => {
    const raw = engineRef.current?.drain_worker_messages();
    if (!raw || !workerRef.current) return;
    // drain_worker_messages returns a JsValue serialized from Vec<serde_json::Value>,
    // which deserializes into a JS array of message objects.
    const msgs = Array.isArray(raw) ? raw : [];
    for (const msg of msgs) {
      workerRef.current.postMessage(msg);
    }
  }, []);

  // Pointer + pinch-zoom handling. Replaces the old mouse-only listeners with
  // unified pointer events that cover mouse, touch, and pen. Single pointer →
  // node-drag OR pan OR hover (depending on hit test). Two pointers → pinch
  // zoom + centroid pan. `touch-action: none` on the canvas prevents the
  // browser from hijacking touch gestures (scroll, double-tap zoom).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    type PointerState = { id: number; x: number; y: number };

    // Cache-adjusted coordinate helpers. The engine expects canvas-local,
    // DPR-scaled coordinates (matches the wheel + existing drag/hover/click
    // FFI contract), not raw clientX/Y.
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      return {
        x: (clientX - rect.left) * dpr,
        y: (clientY - rect.top) * dpr,
      };
    };

    const active: Map<number, PointerState> = new Map();
    // Track whether the current single-pointer gesture is dragging a node,
    // panning the camera, or neither (pre-hit-test state). Resets on release.
    let singleMode: "drag" | "pan" | null = null;
    let suppressNextClick = false;
    let lastPinchDist = 0;
    let lastCentroid: { x: number; y: number } | null = null;

    function centroid(): { x: number; y: number } {
      let x = 0;
      let y = 0;
      for (const p of active.values()) {
        x += p.x;
        y += p.y;
      }
      return { x: x / active.size, y: y / active.size };
    }
    function pinchDist(): number {
      const arr = [...active.values()];
      const dx = arr[0].x - arr[1].x;
      const dy = arr[0].y - arr[1].y;
      return Math.hypot(dx, dy);
    }

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const local = toLocal(e.clientX, e.clientY);
      active.set(e.pointerId, { id: e.pointerId, x: local.x, y: local.y });

      if (active.size === 1) {
        // Hit-test: if the pointer lands on a node, start a node-drag;
        // otherwise start a camera pan.
        const nodeId = engineRef.current?.handle_node_drag_start(local.x, local.y);
        if (nodeId) {
          draggingNodeRef.current = nodeId;
          singleMode = "drag";
          pumpWorkerMessages();
        } else {
          engineRef.current?.handle_pan_start(local.x, local.y);
          singleMode = "pan";
        }
      } else if (active.size === 2) {
        // Second pointer joined — end any single-pointer gesture and begin pinch.
        if (singleMode === "drag") {
          engineRef.current?.handle_node_drag_end();
          pumpWorkerMessages();
          draggingNodeRef.current = null;
          suppressNextClick = true;
        } else if (singleMode === "pan") {
          engineRef.current?.handle_pan_end();
        }
        singleMode = null;
        lastPinchDist = pinchDist();
        lastCentroid = centroid();
      }
    };

    const onMove = (e: PointerEvent) => {
      const existing = active.get(e.pointerId);
      if (!existing) return;
      const local = toLocal(e.clientX, e.clientY);
      active.set(e.pointerId, { id: e.pointerId, x: local.x, y: local.y });

      if (active.size === 1) {
        if (singleMode === "drag") {
          engineRef.current?.handle_node_drag_move(local.x, local.y);
          pumpWorkerMessages();
        } else if (singleMode === "pan") {
          engineRef.current?.handle_pan_move(local.x, local.y);
          // Hover updates only while panning (or hovering without a button).
          const hoveredId = engineRef.current?.handle_hover(local.x, local.y);
          if (hoveredId !== undefined) {
            callbacksRef.current.onNodeHover?.({ id: hoveredId } as NodeData);
          }
        }
      } else if (active.size === 2) {
        const d = pinchDist();
        const c = centroid();
        const deltaZoom = d / Math.max(lastPinchDist, 1e-3);
        // handle_zoom(delta, x, y) — delta > 0 → zoom out, < 0 → zoom in.
        // Invert via -log so a growing distance zooms in.
        engineRef.current?.handle_zoom(-Math.log(deltaZoom), c.x, c.y);
        if (lastCentroid) {
          engineRef.current?.handle_pan_start(lastCentroid.x, lastCentroid.y);
          engineRef.current?.handle_pan_move(c.x, c.y);
          engineRef.current?.handle_pan_end();
        }
        lastPinchDist = d;
        lastCentroid = c;
      }
    };

    const onUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      active.delete(e.pointerId);

      if (active.size === 0) {
        if (singleMode === "drag") {
          engineRef.current?.handle_node_drag_end();
          pumpWorkerMessages();
          // Clear on next tick to suppress the synthetic click that fires
          // immediately after pointerup on the same element.
          setTimeout(() => {
            draggingNodeRef.current = null;
          }, 0);
        } else if (singleMode === "pan") {
          engineRef.current?.handle_pan_end();
        }
        singleMode = null;
        lastCentroid = null;
        lastPinchDist = 0;
      } else if (active.size === 1) {
        // Transitioned from pinch back to single pointer — resume panning from
        // the remaining pointer. Treat as a new pan gesture (not a drag).
        const only = [...active.values()][0];
        engineRef.current?.handle_pan_start(only.x, only.y);
        singleMode = "pan";
        // The next click would be a pinch-release → suppress.
        suppressNextClick = true;
      }
    };

    const onClick = (e: MouseEvent) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (draggingNodeRef.current !== null) return; // consumed by drag
      const local = toLocal(e.clientX, e.clientY);
      const clickedId = engineRef.current?.handle_click(local.x, local.y);
      if (clickedId) {
        callbacksRef.current.onNodeClick?.({ id: clickedId } as NodeData);
      }
    };

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("click", onClick);
    };
  }, [pumpWorkerMessages]);

  useImperativeHandle(
    ref,
    () => ({
      fit: (padding = 40) => engineRef.current?.fit(padding),
      zoomIn: () => engineRef.current?.zoom_in(),
      zoomOut: () => engineRef.current?.zoom_out(),
      relayout: (nextLayout) => {
        // Worker protocol uses `set_layout` (see graph-worker-wasm protocol.rs).
        convergedRef.current = false;
        workerRef.current?.postMessage({ type: "set_layout", layout: nextLayout });
      },
      setTheme: (nextTheme) => engineRef.current?.set_theme(nextTheme),
      setData: (nextSnapshot) => applySnapshot(nextSnapshot),
      selectNode: (id) => engineRef.current?.set_focus(id ?? undefined),
      subscribeFrame: (cb) => {
        // Wrap the high-level callback in the low-level one the engine expects.
        const wrapped = (obj: { positions: Float32Array; vpMatrix: Float32Array }) =>
          cb({ positions: obj.positions, vpMatrix: obj.vpMatrix });
        engineRef.current?.subscribe_frame(wrapped);
        // Engine currently has no unsubscribe API (single-component consumer);
        // return a no-op disposer. If the component remounts while a new engine
        // is created, the subscriber list is rebuilt with the new engine.
        return () => {};
      },
    }),
    [applySnapshot],
  );

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none", ...style }}
    />
  );
});
