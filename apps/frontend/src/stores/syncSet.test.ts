import { describe, expect, it, beforeEach } from "vitest";
import { useSyncSetStore } from "./syncSet";

describe("useSyncSetStore", () => {
  beforeEach(() => {
    const current = useSyncSetStore.getState();
    useSyncSetStore.setState({
      deviceId: current.deviceId,
      contextUserSub: null,
      syncIds: [], hasInitialized: false, pendingSwap: null, sourceMap: new Map(),
    });
  });

  it("loads and unloads", () => {
    useSyncSetStore.getState().load("a");
    useSyncSetStore.getState().load("b");
    expect(useSyncSetStore.getState().syncIds).toEqual(["a", "b"]);
    useSyncSetStore.getState().unload("a");
    expect(useSyncSetStore.getState().syncIds).toEqual(["b"]);
  });

  it("swaps and exposes pendingSwap when same source completes", () => {
    useSyncSetStore.setState({
      syncIds: ["old-A"], hasInitialized: true,
      sourceMap: new Map([["old-A", "src-1"]]),
    });
    useSyncSetStore.getState().onSyncCompleted(
      { id: "new-A", source_id: "src-1", status: "completed" } as any, "acme/api");
    const s = useSyncSetStore.getState();
    expect(s.syncIds).toEqual(["new-A"]);
    expect(s.pendingSwap?.replacedSyncId).toBe("old-A");
  });

  it("does not auto-add new source's first sync", () => {
    useSyncSetStore.setState({
      syncIds: ["old-A"], hasInitialized: true,
      sourceMap: new Map([["old-A", "src-1"]]),
    });
    useSyncSetStore.getState().onSyncCompleted(
      { id: "first-B", source_id: "src-2", status: "completed" } as any, "acme/cli");
    expect(useSyncSetStore.getState().syncIds).toEqual(["old-A"]);
  });

  it("undoSwap restores prior set", () => {
    useSyncSetStore.setState({
      syncIds: ["old-A"], hasInitialized: true,
      sourceMap: new Map([["old-A", "src-1"]]),
    });
    useSyncSetStore.getState().onSyncCompleted(
      { id: "new-A", source_id: "src-1", status: "completed" } as any, "acme/api");
    useSyncSetStore.getState().undoSwap();
    expect(useSyncSetStore.getState().syncIds).toEqual(["old-A"]);
    expect(useSyncSetStore.getState().pendingSwap).toBeNull();
  });

  it("pruneInvalid drops missing ids", () => {
    useSyncSetStore.setState({
      syncIds: ["a", "b", "c"], hasInitialized: true,
    });
    useSyncSetStore.getState().pruneInvalid(new Set(["a", "c"]));
    expect(useSyncSetStore.getState().syncIds).toEqual(["a", "c"]);
  });

  it("initializeIfNeeded seeds the first active set from bootstrap ids", async () => {
    await useSyncSetStore.getState().initializeIfNeeded(["a", "a", "b"]);
    expect(useSyncSetStore.getState().syncIds).toEqual(["a", "b"]);
    expect(useSyncSetStore.getState().hasInitialized).toBe(true);
  });

  it("initializeIfNeeded respects an explicitly empty initialized set", async () => {
    useSyncSetStore.setState({ hasInitialized: true, syncIds: [] });
    await useSyncSetStore.getState().initializeIfNeeded(["seed"]);
    expect(useSyncSetStore.getState().syncIds).toEqual([]);
  });

  it("initializeIfNeeded can force-reseed after stale ids are pruned away", async () => {
    useSyncSetStore.setState({ hasInitialized: true, syncIds: [] });
    await useSyncSetStore.getState().initializeIfNeeded(["seed"], { force: true });
    expect(useSyncSetStore.getState().syncIds).toEqual(["seed"]);
  });
});
