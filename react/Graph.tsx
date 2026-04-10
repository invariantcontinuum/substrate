import React, { useEffect, useRef, useCallback, useState } from "react";
import type {
  GraphSnapshot,
  GraphFilter,
  GraphStats,
  LayoutType,
  NodeData,
  WorkerOutMessage,
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
  onStatsChange?: (stats: GraphStats) => void;
  onReady?: () => void;
  spotlightIds?: string[] | null;
  showCommunities?: boolean;
  className?: string;
  style?: React.CSSProperties;
  authToken?: string;
}

export function Graph({
  snapshotUrl,
  wsUrl,
  snapshot,
  theme,
  layout = "force",
  filter,
  onNodeClick,
  onNodeHover,
  onStatsChange,
  onReady,
  spotlightIds,
  showCommunities = false,
  className,
  style,
  authToken,
}: GraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<any>(null);
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number>(0);
  const convergedRef = useRef(false);
  const callbacksRef = useRef({ onNodeClick, onNodeHover, onStatsChange });
  const [ready, setReady] = useState(false);

  callbacksRef.current = { onNodeClick, onNodeHover, onStatsChange };

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

          if (!convergedRef.current) {
            requestRender();
          }
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

  // Load snapshot from URL
  useEffect(() => {
    if (!ready || !snapshotUrl || !workerRef.current) return;
    fetch(snapshotUrl)
      .then((res) => res.json())
      .then((data) => {
        convergedRef.current = false;
        workerRef.current?.postMessage({
          type: "load_snapshot",
          nodes: data.nodes,
          edges: data.edges,
        });
      })
      .catch((err) => console.error("Snapshot fetch failed:", err));
  }, [ready, snapshotUrl]);

  // Load snapshot from prop
  useEffect(() => {
    if (!ready || !snapshot || !workerRef.current) return;
    convergedRef.current = false;
    workerRef.current.postMessage({
      type: "load_snapshot",
      nodes: snapshot.nodes,
      edges: snapshot.edges,
    });
  }, [ready, snapshot]);

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

  // Layout
  useEffect(() => {
    if (!ready || !workerRef.current) return;
    convergedRef.current = false;
    workerRef.current.postMessage({ type: "set_layout", layout });
  }, [ready, layout]);

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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      engineRef.current?.handle_pan_start(
        (e.clientX - rect.left) * dpr,
        (e.clientY - rect.top) * dpr
      );
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = (e.clientX - rect.left) * dpr;
      const y = (e.clientY - rect.top) * dpr;
      engineRef.current?.handle_pan_move(x, y);
      const hoveredId = engineRef.current?.handle_hover(x, y);
      if (hoveredId !== undefined) {
        callbacksRef.current.onNodeHover?.({ id: hoveredId } as NodeData);
      }
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    engineRef.current?.handle_pan_end();
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const clickedId = engineRef.current?.handle_click(
        (e.clientX - rect.left) * dpr,
        (e.clientY - rect.top) * dpr
      );
      if (clickedId) {
        callbacksRef.current.onNodeClick?.({ id: clickedId } as NodeData);
      }
    },
    []
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      engineRef.current?.handle_zoom(
        e.deltaY,
        (e.clientX - rect.left) * dpr,
        (e.clientY - rect.top) * dpr
      );
    },
    []
  );

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block", ...style }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onWheel={handleWheel}
    />
  );
}
