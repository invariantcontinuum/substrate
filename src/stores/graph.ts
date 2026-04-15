import { create } from "zustand";
import { logger } from "@/lib/logger";
import { apiFetch } from "@/lib/api";

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  layer?: string;
  owner?: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  [key: string]: unknown;
}

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
  // Round-trip time of the most recent successful fetchGraph call. The
  // topbar surfaces this in place of a vague "Live" indicator so the
  // user can see whether the last refresh was fast or crawling.
  lastLoadMs: number | null;
  // Server-side query duration reported in the /api/graph meta payload.
  // Useful to distinguish slow DB from slow network.
  lastServerMs: number | null;
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
  fetchGraph: (token?: string) => Promise<void>;
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
      logger.info("node_selected", { nodeId: id });
    } else {
      logger.info("node_deselected");
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

  stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "", lastLoadMs: null, lastServerMs: null },
  setStats: (stats) => {
    logger.info("stats_updated", { nodes: stats.nodeCount, edges: stats.edgeCount, violations: stats.violationCount });
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
    logger.info("canvas_cleared");
    set({
      nodes: [],
      edges: [],
      signals: [],
      violations: [],
      selectedNodeId: null,
      selectedNodeData: null,
      stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "", lastLoadMs: null, lastServerMs: null },
      searchQuery: "",
      syncProgress: null,
      canvasCleared: true,
    });
  },

  fetchGraph: async (token) => {
    const start = performance.now();
    try {
      // The graph service returns items in cytoscape element format —
      // each node/edge is wrapped as `{data: {...}}`. Unwrap so the rest
      // of the app can treat entries as flat objects keyed by id/name.
      type CytoscapeElement<T> = { data: T } | T;
      const raw = await apiFetch<{
        nodes?: CytoscapeElement<GraphNode>[];
        edges?: CytoscapeElement<GraphEdge>[];
        meta?: { node_count?: number; edge_count?: number; duration_ms?: number };
      }>("/api/graph", token);

      const unwrap = <T>(item: CytoscapeElement<T>): T =>
        item && typeof item === "object" && "data" in item
          ? (item.data as T)
          : (item as T);

      const nodes = (raw.nodes ?? []).map(unwrap<GraphNode>);
      const edges = (raw.edges ?? []).map(unwrap<GraphEdge>);

      // Seed the visible-types filter with every type present in the
      // snapshot so legend items default to "on" for whatever types the
      // backend actually returned (not just the hardcoded DEFAULT_TYPES).
      const presentTypes = new Set<string>();
      for (const n of nodes) presentTypes.add(String(n.type || "unknown"));

      const lastLoadMs = Math.round(performance.now() - start);
      const lastServerMs = raw.meta?.duration_ms ?? null;

      set((state) => ({
        nodes,
        edges,
        filters: { ...state.filters, types: presentTypes },
        stats: {
          nodeCount: raw.meta?.node_count ?? nodes.length,
          edgeCount: raw.meta?.edge_count ?? edges.length,
          violationCount: 0,
          lastUpdated: new Date().toISOString(),
          lastLoadMs,
          lastServerMs,
        },
        connectionStatus: "connected",
      }));
    } catch (err) {
      logger.warn("fetch_graph_failed", { error: String(err) });
      set({ connectionStatus: "disconnected" });
    }
  },
}));
