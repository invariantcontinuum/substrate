import { create } from "zustand";
import { logger } from "@/lib/logger";
import { apiFetch } from "@/lib/api";
import { useSyncSetStore } from "./syncSet";

export interface SlimNode {
  id: string;
  type: string;
  name: string;
  layer?: string;
  source_id?: string;
}

export interface SlimEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

// Aliases preserved so existing callsites (GraphCanvas, NodeDetailPanel,
// DynamicLegend, etc.) still compile during migration. T17/T19 rewrite
// those consumers against the engine-owned Node/Edge shapes.
export type GraphNode = SlimNode;
export type GraphEdge = SlimEdge;

export interface GraphSignal {
  nodeId: string;
  type: string;
  timestamp: string | number;
}

export interface GraphViolation {
  id: string;
  message?: string;
  [key: string]: unknown;
}

export interface GraphFilters {
  types: Set<string>;
  layers: string[];
}

/**
 * User-tweakable graph rendering parameters. Currently focused on
 * Leiden community detection; structured so we can add more groups
 * (force layout, spatial pruning, edge bundling, etc.) without
 * breaking the persisted shape.
 */
export interface GraphConfig {
  leiden: {
    enabled: boolean;
    resolution: number;     // typical 0.1 – 5; higher = more, smaller communities
    beta: number;           // randomness during refinement (0 – 0.1 normal)
    iterations: number;     // refinement passes (1 – 20)
    minClusterSize: number; // suppress communities below this many nodes
  };
}

const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  leiden: {
    enabled: false,
    resolution: 1.0,
    beta: 0.01,
    iterations: 10,
    minClusterSize: 4,
  },
};

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  violationCount: number;
  lastUpdated: string;
  // End-to-end load time: from fetchGraph start until the canvas layout
  // settles. Captures fetch + JSON parse + reconciliation + engine
  // add/layout, so the topbar reflects what the user actually waited for.
  // Finalised by the canvas via finalizeLoad() when the engine signals
  // the first frame is ready (onReady callback).
  lastLoadMs: number | null;
  // Network/parse round-trip time for /api/graph alone.
  lastFetchMs: number | null;
  // Server-side query duration reported in the /api/graph meta payload.
  // Useful to distinguish slow DB from slow network.
  lastServerMs: number | null;
  // Internal: timestamp (performance.now) when the in-flight fetchGraph
  // started. Non-null while a load is awaiting the engine's ready
  // signal. The canvas reads this to decide whether to call
  // finalizeLoad after layout completes.
  loadStartedAt: number | null;
}

interface GraphState {
  /* Graph data (populated by fetchGraph from real backend) */
  nodes: GraphNode[];
  edges: GraphEdge[];
  signals: GraphSignal[];
  violations: GraphViolation[];

  /* Selection */
  selectedNodeId: string | null;
  selectedNodeData: Record<string, unknown> | null;
  selectNode: (id: string | null, data?: Record<string, unknown>) => void;
  setSelectedNodeId: (id: string | null) => void;

  /* Filters */
  filters: GraphFilters;
  toggleTypeFilter: (type: string) => void;
  isolateTypeFilter: (type: string, allTypes: string[]) => void;
  setFilters: (filters: GraphFilters) => void;
  resetFilters: () => void;

  /* Layout */
  layout: "force" | "hierarchical";
  setLayout: (layout: "force" | "hierarchical") => void;
  layoutName: string;
  setLayoutName: (name: string) => void;

  /* Viewport */
  zoom: number;
  setZoom: (z: number) => void;
  pan: { x: number; y: number };
  setPan: (p: { x: number; y: number }) => void;
  nodeSize: number;
  setNodeSize: (size: number) => void;

  /* Stats / status */
  stats: GraphStats;
  setStats: (stats: GraphStats) => void;
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  setConnectionStatus: (status: "connected" | "disconnected" | "reconnecting") => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  syncStatus: "idle" | "syncing" | "error";
  setSyncStatus: (status: "idle" | "syncing" | "error") => void;
  syncProgress: { done: number; total: number } | null;
  setSyncProgress: (progress: { done: number; total: number } | null) => void;

  /* Canvas lifecycle */
  canvasCleared: boolean;
  setCanvasCleared: (v: boolean) => void;
  clearCanvas: () => void;

  /* Rendering / clustering config */
  graphConfig: GraphConfig;
  setGraphConfig: (next: Partial<GraphConfig>) => void;
  setLeidenConfig: (next: Partial<GraphConfig["leiden"]>) => void;
  resetGraphConfig: () => void;

  /* Data loading */
  fetchGraph: (token?: string, syncIds?: string[]) => Promise<void>;
  // Called by the canvas when the render engine signals its first frame
  // is ready (e.g. via an onReady callback), so the topbar timer
  // reflects fetch + render, not just the network round-trip.
  // Engine-agnostic: the store does not subscribe to any engine events.
  finalizeLoad: () => void;

  /* Per-sync render time (ms). Populated by finalizeLoad; keyed by the
   * sync ids that were active at the moment the engine finished its
   * first layout. In-memory only — a page reload clears it. Consumed
   * by the Sources page to show "Render time: 812 ms" in the expanded
   * snapshot row. */
  renderTimeBySyncId: Record<string, number>;
  recordRenderTime: (syncIds: string[], ms: number) => void;
}

const DEFAULT_TYPES = [
  "service", "database", "cache", "external",
  "source", "config", "script", "doc", "data", "asset",
  "policy", "adr", "incident",
];

const DEFAULT_LAYERS = ["infra", "platform", "domain", "app", "data"];

const initialFilters = (): GraphFilters => ({
  types: new Set(DEFAULT_TYPES),
  layers: [...DEFAULT_LAYERS],
});

export const useGraphStore = create<GraphState>((set) => ({
  nodes: [],
  edges: [],
  signals: [],
  violations: [],

  selectedNodeId: null,
  selectedNodeData: null,
  selectNode: (id, data) => {
    if (id) {
      logger.debug("node_selected", { nodeId: id });
    } else {
      logger.debug("node_deselected");
    }
    set({ selectedNodeId: id, selectedNodeData: data ?? null });
  },
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  filters: initialFilters(),
  toggleTypeFilter: (type) =>
    set((state) => {
      const types = new Set(state.filters.types);
      if (types.has(type)) types.delete(type);
      else types.add(type);
      return { filters: { ...state.filters, types } };
    }),
  isolateTypeFilter: (type, allTypes) =>
    set((state) => {
      const soleActive =
        state.filters.types.size === 1 && state.filters.types.has(type);
      // Clicking the currently-isolated type toggles back to "all
      // types visible". Otherwise the click isolates the chosen type
      // as the only visible category.
      const nextTypes = soleActive ? new Set(allTypes) : new Set([type]);
      return { filters: { ...state.filters, types: nextTypes } };
    }),
  setFilters: (filters) => set({ filters }),
  resetFilters: () => set({ filters: initialFilters() }),

  layout: "force",
  setLayout: (layout) => set({ layout }),
  layoutName: "cose",
  setLayoutName: (layoutName) => set({ layoutName }),

  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
  pan: { x: 0, y: 0 },
  setPan: (pan) => set({ pan }),
  nodeSize: 24,
  setNodeSize: (nodeSize) => set({ nodeSize }),

  stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "", lastLoadMs: null, lastFetchMs: null, lastServerMs: null, loadStartedAt: null },
  setStats: (stats) => {
    logger.debug("stats_updated", { nodes: stats.nodeCount, edges: stats.edgeCount, violations: stats.violationCount });
    set({ stats });
  },

  connectionStatus: "disconnected",
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  syncStatus: "idle",
  setSyncStatus: (syncStatus) => set({ syncStatus }),

  syncProgress: null,
  setSyncProgress: (syncProgress) => set({ syncProgress }),

  canvasCleared: false,
  setCanvasCleared: (canvasCleared) => set({ canvasCleared }),

  graphConfig: DEFAULT_GRAPH_CONFIG,
  setGraphConfig: (next) =>
    set((state) => ({ graphConfig: { ...state.graphConfig, ...next } })),
  setLeidenConfig: (next) =>
    set((state) => ({
      graphConfig: { ...state.graphConfig, leiden: { ...state.graphConfig.leiden, ...next } },
    })),
  resetGraphConfig: () => set({ graphConfig: DEFAULT_GRAPH_CONFIG }),

  clearCanvas: () => {
    logger.debug("canvas_cleared");
    set({
      nodes: [],
      edges: [],
      signals: [],
      violations: [],
      selectedNodeId: null,
      selectedNodeData: null,
      stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "", lastLoadMs: null, lastFetchMs: null, lastServerMs: null, loadStartedAt: null },
      searchQuery: "",
      syncProgress: null,
      canvasCleared: true,
      renderTimeBySyncId: {},
    });
  },

  fetchGraph: async (token, syncIds = []) => {
    const start = performance.now();
    // Empty syncIds is a no-op — never clear an already-loaded graph
    // implicitly. The canvas only empties via the explicit clearCanvas
    // action or when the user removes every sync from the active set
    // through the SyncSet store. Token-refresh re-renders used to land
    // here and wipe the user's graph; that bug stays fixed by this guard.
    if (!syncIds.length) return;
    try {
      const url = `/api/graph?sync_ids=${encodeURIComponent(syncIds.join(","))}`;
      const raw = await apiFetch<{
        nodes: { data: GraphNode }[];
        edges: { data: GraphEdge }[];
        meta: { node_count?: number; edge_count?: number; duration_ms?: number;
                active_sync_ids?: string[] };
      }>(url, token);
      const nodes = (raw.nodes ?? []).map((n) => n.data);
      const edges = (raw.edges ?? []).map((e) => e.data);
      const presentTypes = new Set<string>();
      for (const n of nodes) presentTypes.add(String(n.type || "unknown"));
      const fetchMs = Math.round(performance.now() - start);
      set((state) => ({
        nodes, edges,
        filters: { ...state.filters, types: presentTypes },
        stats: {
          nodeCount: raw.meta?.node_count ?? nodes.length,
          edgeCount: raw.meta?.edge_count ?? edges.length,
          violationCount: 0,
          lastUpdated: new Date().toISOString(),
          // lastLoadMs stays as the previous load's value until the
          // canvas finishes laying out the new data (finalizeLoad).
          lastLoadMs: state.stats.lastLoadMs,
          lastFetchMs: fetchMs,
          lastServerMs: raw.meta?.duration_ms ?? null,
          loadStartedAt: start,
        },
        connectionStatus: "connected",
      }));
    } catch (err) {
      logger.warn("fetch_graph_failed", { error: String(err) });
      set({ connectionStatus: "disconnected" });
    }
  },

  finalizeLoad: () =>
    set((state) => {
      const t0 = state.stats.loadStartedAt;
      if (t0 == null) return {};
      const ms = Math.round(performance.now() - t0);
      // Stamp each currently-loaded sync with this render time. We do
      // this inside finalizeLoad rather than exposing two mutators
      // because the elapsed window (t0..now) is only meaningful here.
      const activeIds = useSyncSetStore.getState().syncIds;
      const next = { ...state.renderTimeBySyncId };
      for (const id of activeIds) next[id] = ms;
      return {
        stats: {
          ...state.stats,
          lastLoadMs: ms,
          loadStartedAt: null,
        },
        renderTimeBySyncId: next,
      };
    }),

  renderTimeBySyncId: {},
  recordRenderTime: (syncIds, ms) =>
    set((state) => {
      const next = { ...state.renderTimeBySyncId };
      for (const id of syncIds) next[id] = ms;
      return { renderTimeBySyncId: next };
    }),
}));

// Debounced refetch on active-set changes. Initialized lazily so SSR/tests
// without `window` don't crash.
//
// `lastSyncIdsKey` is seeded from the already-hydrated store (zustand
// persist runs synchronously during create()). Without this seed, the
// FIRST mutation after mount — typically DashboardLayout's pruneInvalid,
// which produces a new array reference with identical contents — would
// fire a redundant fetchGraph alongside App.tsx's initial-load effect.
// Two concurrent /api/graph requests for the same syncIds produced a
// double engine add+layout cycle for ~100k node graphs, which the user
// experienced as the canvas going blank right after it first appeared.
let refetchTimer: ReturnType<typeof setTimeout> | null = null;
let lastSyncIdsKey =
  typeof window !== "undefined"
    ? useSyncSetStore.getState().syncIds.join(",")
    : "";
if (typeof window !== "undefined") {
  useSyncSetStore.subscribe((state) => {
    const key = state.syncIds.join(",");
    if (key === lastSyncIdsKey) return;
    lastSyncIdsKey = key;
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      const tok = (window as Window & { __authToken?: string }).__authToken;
      void useGraphStore.getState().fetchGraph(tok, state.syncIds);
    }, 200);
  });
}
