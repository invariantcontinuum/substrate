import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "./ui";

describe("useUIStore.activeView", () => {
  beforeEach(() => {
    useUIStore.setState({ activeView: "graph", sourcesPageTarget: null });
  });

  it("defaults to graph", () => {
    expect(useUIStore.getState().activeView).toBe("graph");
  });

  it("setActiveView updates the flag", () => {
    useUIStore.getState().setActiveView("sources");
    expect(useUIStore.getState().activeView).toBe("sources");
  });

  it("setSourcesPageTarget stores target then can be cleared", () => {
    useUIStore.getState().setSourcesPageTarget({ sourceId: "abc", expandSyncId: "xyz" });
    expect(useUIStore.getState().sourcesPageTarget).toEqual({ sourceId: "abc", expandSyncId: "xyz" });
    useUIStore.getState().setSourcesPageTarget(null);
    expect(useUIStore.getState().sourcesPageTarget).toBeNull();
  });
});
