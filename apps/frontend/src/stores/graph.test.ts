import { describe, it, expect, beforeEach } from "vitest";
import { useGraphStore } from "./graph";

describe("useGraphStore — render time tracking", () => {
  beforeEach(() => {
    useGraphStore.setState({
      nodes: [], edges: [], signals: [], violations: [],
      renderTimeBySyncId: {},
      stats: {
        nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "",
        lastLoadMs: null, lastFetchMs: null, lastServerMs: null,
        loadStartedAt: null,
      },
    });
  });

  it("recordRenderTime stores ms keyed by each sync id", () => {
    useGraphStore.getState().recordRenderTime(["s1", "s2"], 812);
    expect(useGraphStore.getState().renderTimeBySyncId).toEqual({
      s1: 812, s2: 812,
    });
  });

  it("finalizeLoad records render time for all currently-loaded syncs", async () => {
    // Simulate a fetchGraph-style load that stamped loadStartedAt.
    useGraphStore.setState({
      stats: {
        nodeCount: 0, edgeCount: 0, violationCount: 0, lastUpdated: "",
        lastLoadMs: null, lastFetchMs: null, lastServerMs: null,
        loadStartedAt: performance.now() - 500, // 500ms ago
      },
    });

    // Stub out syncSetStore import side so finalizeLoad can read active ids.
    // (If finalizeLoad reaches into syncSet, wire the fake via setState there.)
    const { useSyncSetStore } = await import("./syncSet");
    useSyncSetStore.setState({
      syncIds: ["s1", "s2"], hasInitialized: true,
      pendingSwap: null, sourceMap: new Map(),
    });

    useGraphStore.getState().finalizeLoad();

    const recorded = useGraphStore.getState().renderTimeBySyncId;
    expect(recorded.s1).toBeGreaterThanOrEqual(400);
    expect(recorded.s2).toBeGreaterThanOrEqual(400);
  });
});
