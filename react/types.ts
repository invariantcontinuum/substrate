export interface NodeData {
  id: string;
  name: string;
  type: string;
  domain: string;
  status: string;
  community?: number;
  meta: Record<string, unknown>;
}

export interface EdgeData {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  weight: number;
}

export interface GraphSnapshot {
  nodes: NodeData[];
  edges: EdgeData[];
  meta: {
    node_count: number;
    edge_count: number;
    last_updated?: string;
  };
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  violationCount: number;
  lastUpdated: string;
}

export interface GraphFilter {
  types?: string[];
  domains?: string[];
  status?: string[];
}

export type LayoutType = "force" | "hierarchical";

// --- Worker protocol types ---

export type WorkerOutMessage =
  | { type: "positions"; positions: ArrayBuffer; flags: ArrayBuffer; visible_count: number }
  | { type: "snapshot_loaded"; node_count: number; edge_count: number; node_types: string[]; domains: string[] }
  | { type: "stats"; node_count: number; edge_count: number; violation_count: number; last_updated: string }
  | { type: "converged" }
  | { type: "ws_nodes_added"; count: number }
  | { type: "ws_status"; status: "connected" | "reconnecting" | "failed" };
