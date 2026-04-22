import { useMemo } from "react";
import type { GraphSnapshot } from "@invariantcontinuum/graph/react";
import { useGraphStore } from "@/stores/graph";
import type { SlimNode, SlimEdge } from "@/stores/graph";

// Pure — exported for unit tests.
export function buildSnapshotFromSlim(
  nodes: SlimNode[],
  edges: SlimEdge[],
  visibleTypes: Set<string>,
): GraphSnapshot {
  const visibleNodes = nodes.filter((n) => visibleTypes.has(String(n.type || "unknown")));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  return {
    nodes: visibleNodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: (n.type as string) || "external",
      domain: n.layer ?? "unknown",
      status: "healthy",
      meta: { source_id: n.source_id ?? null },
    })),
    edges: visibleEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      label: "",
      weight: 1,
    })),
    meta: { node_count: visibleNodes.length, edge_count: visibleEdges.length },
  };
}

export interface UseGraphSnapshotResult {
  snapshot: GraphSnapshot;
  nodeIds: string[];
  labels: Record<string, string>;
  nodeTypeMap: Record<string, string>;
  nodeSourceIds: Record<string, string | null>;
}

function nodeFileLabel(name: string | undefined, fallbackId: string): string {
  const raw = (name ?? "").trim();
  if (!raw) return fallbackId;
  const normalized = raw.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) || raw : raw;
}

export function useGraphSnapshot(): UseGraphSnapshotResult {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const visibleTypes = useGraphStore((s) => s.filters.types);

  const snapshot = useMemo(
    () => buildSnapshotFromSlim(nodes, edges, visibleTypes),
    [nodes, edges, visibleTypes],
  );

  const nodeIds = useMemo(() => snapshot.nodes.map((n) => n.id), [snapshot]);

  const labels = useMemo(
    () =>
      Object.fromEntries(
        snapshot.nodes.map((n) => [n.id, nodeFileLabel(n.name, n.id)]),
      ),
    [snapshot],
  );

  const nodeTypeMap = useMemo(
    () =>
      Object.fromEntries(
        snapshot.nodes.map((n) => [n.id, (n.type as string) || "external"]),
      ),
    [snapshot],
  );

  const nodeSourceIds = useMemo(
    () =>
      Object.fromEntries(
        snapshot.nodes.map((n) => [
          n.id,
          ((n.meta as { source_id?: string | null } | undefined)?.source_id) ?? null,
        ]),
      ),
    [snapshot],
  );

  return { snapshot, nodeIds, labels, nodeTypeMap, nodeSourceIds };
}
