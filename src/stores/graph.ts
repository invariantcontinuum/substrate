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

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  violationCount: number;
  lastUpdated: string;
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

  /* Data loading */
  fetchGraph: () => Promise<void>;
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

  stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "" },
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

  clearCanvas: () => {
    logger.info("canvas_cleared");
    set({
      nodes: [],
      edges: [],
      signals: [],
      violations: [],
      selectedNodeId: null,
      selectedNodeData: null,
      stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "" },
      searchQuery: "",
      syncProgress: null,
      canvasCleared: true,
    });
  },

  fetchGraph: async () => {
    try {
      const data = await apiFetch<{ nodes?: GraphNode[]; edges?: GraphEdge[] }>(
        "/api/graph",
        undefined
      );
      set({ nodes: data.nodes ?? [], edges: data.edges ?? [] });
    } catch (err) {
      logger.warn("fetch_graph_failed", { error: String(err) });
    }
  },
}));
