import { describe, test, expect } from "vitest";
import { worldToScreen, screenZoom, bitKey } from "./vpMath";

describe("vpMath", () => {
  test("identity VP maps world (0,0) to the screen center", () => {
    const vp = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const { sx, sy } = worldToScreen(0, 0, vp, 800, 600);
    expect(sx).toBeCloseTo(400);
    expect(sy).toBeCloseTo(300);
  });

  test("translated VP shifts screen projection", () => {
    const vp = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0.5,0,0,1]);
    const { sx } = worldToScreen(0, 0, vp, 800, 600);
    expect(sx).toBeCloseTo(600); // (+0.5 + 1) * 0.5 * 800
  });

  test("screenZoom recovers scale from VP", () => {
    const vp = new Float32Array([2,0,0,0, 0,2,0,0, 0,0,1,0, 0,0,0,1]);
    expect(screenZoom(vp, 1000, 1)).toBeCloseTo(1000); // hypot(2,0)*0.5*1000/1
  });

  test("bitKey is collision-free for distinct f32 coordinates", () => {
    // Use a gap larger than f32 epsilon at this magnitude (~2.4e-7 for f32).
    const a = bitKey(1.5, 2.25);
    const b = bitKey(1.5, 2.5);
    expect(a).not.toBe(b);
  });

  test("bitKey is identical for byte-identical coordinates", () => {
    const a = bitKey(3.75, 4.125);
    const b = bitKey(3.75, 4.125);
    expect(a).toBe(b);
  });
});
