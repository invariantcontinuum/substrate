import { create } from "zustand";

export interface GraphNode {
  data: {
    id: string;
    name: string;
    type: string;
    domain: string;
    status: string;
    source: string;
    meta: Record<string, unknown>;
  };
}

export interface GraphEdge {
  data: {
    id: string;
    source: string;
    target: string;
    type: string;
    label: string;
  };
}

interface GraphState {
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;

  filters: {
    types: Set<string>;
    source: string | null;
  };
  toggleTypeFilter: (type: string) => void;
  setSourceFilter: (source: string | null) => void;

  layout: "cose" | "dagre" | "circle";
  setLayout: (layout: "cose" | "dagre" | "circle") => void;

  connectionStatus: "connected" | "disconnected" | "reconnecting";
  setConnectionStatus: (
    status: "connected" | "disconnected" | "reconnecting"
  ) => void;

  stats: { nodeCount: number; edgeCount: number; violationCount: number; lastUpdated: string };
  setStats: (stats: {
    nodeCount: number;
    edgeCount: number;
    violationCount: number;
    lastUpdated: string;
  }) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  selectedNodeId: null,
  selectNode: (id) => set({ selectedNodeId: id }),

  filters: {
    types: new Set(["service", "database", "cache", "external"]),
    source: null,
  },
  toggleTypeFilter: (type) =>
    set((state) => {
      const types = new Set(state.filters.types);
      if (types.has(type)) types.delete(type);
      else types.add(type);
      return { filters: { ...state.filters, types } };
    }),
  setSourceFilter: (source) =>
    set((state) => ({ filters: { ...state.filters, source } })),

  layout: "cose",
  setLayout: (layout) => set({ layout }),

  connectionStatus: "disconnected",
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  stats: { nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "" },
  setStats: (stats) => set({ stats }),
}));
