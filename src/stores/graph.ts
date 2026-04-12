import { create } from "zustand";

interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  violationCount: number;
  lastUpdated: string;
}

interface GraphState {
  selectedNodeId: string | null;
  selectedNodeData: Record<string, unknown> | null;
  selectNode: (id: string | null, data?: Record<string, unknown>) => void;

  filters: {
    types: Set<string>;
  };
  toggleTypeFilter: (type: string) => void;

  layout: "force" | "hierarchical";
  setLayout: (layout: "force" | "hierarchical") => void;

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

  canvasCleared: boolean;
  setCanvasCleared: (v: boolean) => void;

  clearCanvas: () => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  selectedNodeId: null,
  selectedNodeData: null,
  selectNode: (id, data) =>
    set({ selectedNodeId: id, selectedNodeData: data ?? null }),

  filters: {
    types: new Set(["service", "database", "cache", "external"]),
  },
  toggleTypeFilter: (type) =>
    set((state) => {
      const types = new Set(state.filters.types);
      if (types.has(type)) types.delete(type);
      else types.add(type);
      return { filters: { types } };
    }),

  layout: "force",
  setLayout: (layout) => set({ layout }),

  stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "" },
  setStats: (stats) => set({ stats }),

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

  clearCanvas: () =>
    set({
      selectedNodeId: null,
      selectedNodeData: null,
      stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "" },
      searchQuery: "",
      syncProgress: null,
      canvasCleared: true,
    }),
}));
