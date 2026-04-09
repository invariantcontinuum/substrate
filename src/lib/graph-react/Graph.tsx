import React, { useEffect, useRef, useCallback } from "react";
import type {
  GraphSnapshot,
  GraphFilter,
  GraphStats,
  LayoutType,
  NodeData,
} from "./types";

export interface GraphProps {
  /** URL to fetch snapshot JSON from (alternative to passing snapshot directly) */
  snapshotUrl?: string;
  /** WebSocket base URL for real-time updates */
  wsUrl?: string;
  /** Snapshot data passed directly */
  snapshot?: GraphSnapshot;
  /** Theme configuration object (matches ThemeConfig schema) */
  theme?: Record<string, unknown>;
  /** Layout algorithm */
  layout?: LayoutType;
  /** Filter to restrict visible nodes */
  filter?: GraphFilter | null;
  /** Called when a node is clicked */
  onNodeClick?: (node: NodeData) => void;
  /** Called when a node is hovered (null when hover ends) */
  onNodeHover?: (node: NodeData | null) => void;
  /** Called when graph stats change */
  onStatsChange?: (stats: GraphStats) => void;
  /** Called when the engine is ready */
  onReady?: (engine: any) => void;
  /** IDs to spotlight (dim all others) */
  spotlightIds?: string[] | null;
  /** Number of hops to expand from selected node */
  expandHops?: number;
  /** Show community hull overlays */
  showCommunities?: boolean;
  /** CSS class name for the container */
  className?: string;
  /** Inline styles for the container */
  style?: React.CSSProperties;
  /** Auth token for WebSocket connection */
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
  const rafRef = useRef<number>(0);
  const wasmRef = useRef<any>(null);

  // Initialize WASM and engine
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Lazy-load the WASM module from the npm package
      const wasm = await import("@invariantcontinuum/graph");
      await wasm.default();
      if (cancelled) return;
      wasmRef.current = wasm;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const engine = new wasm.GraphEngine(canvas);
      engineRef.current = engine;

      // Register callbacks
      if (onNodeClick) {
        engine.on("node_click", onNodeClick);
      }
      if (onNodeHover) {
        engine.on("node_hover", onNodeHover);
      }
      if (onStatsChange) {
        engine.on("stats_change", onStatsChange);
      }

      if (onReady) {
        onReady(engine);
      }

      // Start render loop
      function loop(timestamp: number) {
        if (cancelled) return;
        engine.frame(timestamp);
        rafRef.current = requestAnimationFrame(loop);
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    init().catch((err) => console.error("Graph WASM init failed:", err));

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load snapshot from URL
  useEffect(() => {
    if (!snapshotUrl || !engineRef.current) return;
    fetch(snapshotUrl)
      .then((res) => res.json())
      .then((data) => {
        engineRef.current?.load_snapshot(data);
      })
      .catch((err) => console.error("Snapshot fetch failed:", err));
  }, [snapshotUrl]);

  // Load snapshot from prop
  useEffect(() => {
    if (!snapshot || !engineRef.current) return;
    engineRef.current.load_snapshot(snapshot);
  }, [snapshot]);

  // WebSocket connection
  useEffect(() => {
    if (!wsUrl || !authToken || !engineRef.current) return;
    engineRef.current.connect_websocket(wsUrl, authToken);
  }, [wsUrl, authToken]);

  // Theme updates
  useEffect(() => {
    if (!theme || !engineRef.current) return;
    engineRef.current.set_theme(theme);
  }, [theme]);

  // Layout changes
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.set_layout(layout);
  }, [layout]);

  // Filter changes
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.filter(filter ?? null);
  }, [filter]);

  // Spotlight changes
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.spotlight(spotlightIds ?? null);
  }, [spotlightIds]);

  // Community hulls
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.set_community_hulls(showCommunities);
  }, [showCommunities]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dpr = window.devicePixelRatio || 1;
    engineRef.current?.handle_pan_start(x * dpr, y * dpr);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dpr = window.devicePixelRatio || 1;
    const engine = engineRef.current;
    if (!engine) return;
    engine.handle_pan_move(x * dpr, y * dpr);
    engine.handle_hover(x * dpr, y * dpr);
  }, []);

  const handleMouseUp = useCallback(() => {
    engineRef.current?.handle_pan_end();
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dpr = window.devicePixelRatio || 1;
    engineRef.current?.handle_click(x * dpr, y * dpr);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dpr = window.devicePixelRatio || 1;
    engineRef.current?.handle_zoom(e.deltaY, x * dpr, y * dpr);
  }, []);

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
