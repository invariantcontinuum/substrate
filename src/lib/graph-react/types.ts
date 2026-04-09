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
