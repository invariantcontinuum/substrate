import { describe, test, expect } from "vitest";
import { buildSnapshotFromSlim } from "./useGraphSnapshot";
import type { SlimNode, SlimEdge } from "@/stores/graph";

const N = (id: string, type: string, extras: Partial<SlimNode> = {}): SlimNode =>
  ({ id, type, name: id, ...extras });
const E = (id: string, source: string, target: string, type: string): SlimEdge =>
  ({ id, source, target, type });

describe("buildSnapshotFromSlim", () => {
  test("filters nodes by visible types", () => {
    const nodes = [N("a", "service"), N("b", "asset"), N("c", "service")];
    const edges = [E("e1", "a", "b", "depends"), E("e2", "a", "c", "depends")];
    const out = buildSnapshotFromSlim(nodes, edges, new Set(["service"]));
    expect(out.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(out.edges.map((e) => e.id)).toEqual(["e2"]); // e1 dropped: b filtered out
  });

  test("source_id passes through meta", () => {
    const nodes = [N("a", "service", { source_id: "src-1" })];
    const out = buildSnapshotFromSlim(nodes, [], new Set(["service"]));
    expect((out.nodes[0].meta as { source_id: string | null }).source_id).toBe("src-1");
  });

  test("domain falls back to 'unknown' when layer missing", () => {
    const nodes = [N("a", "service")];
    const out = buildSnapshotFromSlim(nodes, [], new Set(["service"]));
    expect((out.nodes[0] as { domain: string }).domain).toBe("unknown");
  });
});
