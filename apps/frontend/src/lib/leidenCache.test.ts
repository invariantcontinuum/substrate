import { describe, expect, it } from "vitest";
import { canonicalCacheKey, type LeidenConfig } from "./leidenCache";

const CFG: LeidenConfig = {
  resolution: 1.0,
  beta: 0.01,
  iterations: 10,
  min_cluster_size: 4,
  seed: 42,
};

describe("canonicalCacheKey", () => {
  it("is deterministic", async () => {
    const ids = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ];
    const a = await canonicalCacheKey(ids, CFG);
    const b = await canonicalCacheKey(ids, CFG);
    expect(a).toBe(b);
  });

  it("is independent of sync_id order", async () => {
    const ids = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ];
    const a = await canonicalCacheKey(ids, CFG);
    const b = await canonicalCacheKey([...ids].reverse(), CFG);
    expect(a).toBe(b);
  });

  it("distinguishes different configs", async () => {
    const ids = ["11111111-1111-1111-1111-111111111111"];
    const a = await canonicalCacheKey(ids, CFG);
    const b = await canonicalCacheKey(ids, { ...CFG, resolution: 2.0 });
    expect(a).not.toBe(b);
  });

  it("returns lowercase hex of length 64", async () => {
    const k = await canonicalCacheKey(["abc"], CFG);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
