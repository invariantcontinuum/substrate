import { useMemo } from "react";
import { useAssignments } from "@/hooks/useAssignments";
import { useCommunities } from "@/hooks/useCommunities";
import { useGraphStore } from "@/stores/graph";
import { usePrefsStore } from "@/stores/prefs";
import { useSyncSetStore } from "@/stores/syncSet";

/**
 * Carousel slide model.
 *
 * Phase 3 dropped the legacy "All" slide — every slide now scopes the
 * canvas to a non-empty subset of nodes. The slide list contains:
 *
 *   slot 0..N-1   one Leiden community each, in the order the server
 *                 returned them (already sorted by size descending).
 *   slot N        an "Other" slide carrying every node that didn't
 *                 land in any community. Omitted when no orphans exist.
 *
 * Empty result: when there are no communities and no orphans, the
 * carousel renders a one-line empty-state placeholder ("Run sync to
 * detect communities") and produces zero slides.
 */
export type Slide =
  | { kind: "community"; index: number; label: string; size: number;
      nodeIds: Set<string> }
  | { kind: "other";     index: -1;     label: "Other"; size: number;
      nodeIds: Set<string> };

/**
 * Slide-derivation hook. Three consumers (GraphCanvas legend gating,
 * the GraphSearchDropdown slide routing, and the carousel itself) need
 * the same slide list, so we publish it through a hook that takes the
 * active sync
 * set + Leiden config from the global stores. The carousel itself uses
 * the same hook so all three views agree on slot order.
 *
 * ID-space caveat: assignments are keyed by ``file_embeddings.id`` UUIDs
 * (the ``file_id`` the backend emits), while cytoscape identifies nodes
 * by the synthetic ``src_<source_uuid>:<file_path>`` strings from
 * ``/api/graph`` (SlimNode.id). Each SlimNode carries its UUID on
 * ``.uuid``. We build a UUID→synthetic map once and translate every
 * bucket into cytoscape's address space so the canvas visibility
 * filter actually matches the nodes it knows about.
 */
export function useCarouselSlides(): {
  slides: Slide[];
  cacheKey: string | null;
  loading: boolean;
  error: string | null;
} {
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const prefsLeiden = usePrefsStore((s) => s.leiden);
  const hydrated = usePrefsStore((s) => s.hydrated);
  const allNodes = useGraphStore((s) => s.nodes);

  const { data, loading, error } = useCommunities(
    syncIds,
    hydrated ? prefsLeiden : null,
  );
  const { assignments } = useAssignments(data?.cache_key ?? null);

  const slides = useMemo<Slide[]>(() => {
    if (!data) return [];
    const uuidToCanvasId = new Map<string, string>();
    for (const n of allNodes) {
      if (n.uuid) uuidToCanvasId.set(n.uuid, n.id);
    }
    const toCanvasId = (uuid: string): string | undefined =>
      uuidToCanvasId.get(uuid);

    // Group assigned UUIDs by community index once; fall back to the
    // summary-response sample when the NDJSON stream hasn't yet arrived
    // so the canvas has *something* to filter on immediately. Values in
    // each bucket are already translated to cytoscape synthetic ids.
    const byCommunity = new Map<number, Set<string>>();
    const clusteredCanvasIds = new Set<string>();
    for (const [uuid, cidx] of assignments.entries()) {
      if (cidx < 0) continue;
      const canvasId = toCanvasId(uuid);
      if (!canvasId) continue;
      let bucket = byCommunity.get(cidx);
      if (!bucket) {
        bucket = new Set();
        byCommunity.set(cidx, bucket);
      }
      bucket.add(canvasId);
      clusteredCanvasIds.add(canvasId);
    }

    const out: Slide[] = [];
    for (const entry of data.communities) {
      const streamed = byCommunity.get(entry.index);
      let ids: Set<string>;
      if (streamed && streamed.size > 0) {
        ids = streamed;
      } else {
        ids = new Set();
        for (const uuid of entry.node_ids_sample) {
          const canvasId = toCanvasId(uuid);
          if (canvasId) {
            ids.add(canvasId);
            clusteredCanvasIds.add(canvasId);
          }
        }
      }
      // Display the *renderable* count — i.e. the size of the synthetic
      // id set that the canvas can actually filter to. Some UUIDs from
      // the Leiden cache may not have a corresponding cytoscape node
      // (e.g., trimmed by /api/graph weight cutoff), so falling back to
      // ``entry.size`` would over-promise: the label "23 nodes" while
      // the canvas shows 18 is a bug.
      out.push({
        kind: "community",
        index: entry.index,
        label: entry.label,
        size: ids.size,
        nodeIds: ids,
      });
    }

    // Other slot — nodes that aren't in any surviving community. Derived
    // from whatever the canvas has loaded, minus every clustered id,
    // both in the canvas (synthetic) id space.
    const orphans = new Set<string>();
    for (const n of allNodes) {
      if (!clusteredCanvasIds.has(n.id)) orphans.add(n.id);
    }
    if (orphans.size > 0) {
      out.push({
        kind: "other",
        index: -1,
        label: "Other",
        size: orphans.size,
        nodeIds: orphans,
      });
    }
    return out;
  }, [data, assignments, allNodes]);

  return {
    slides,
    cacheKey: data?.cache_key ?? null,
    loading,
    error,
  };
}
