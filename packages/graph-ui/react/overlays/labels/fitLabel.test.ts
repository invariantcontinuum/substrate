import { describe, test, expect } from "vitest";
import { fitLabelInBox } from "./fitLabel";

// jsdom does not provide a real Canvas2D context; mock the surface used by
// fitLabelInBox. An average of ~6 px/char is close enough for the wrap logic
// to exercise its branches meaningfully.
const ctx = {
  font: "",
  measureText: (s: string) => ({ width: s.length * 6 }),
} as unknown as CanvasRenderingContext2D;

describe("fitLabelInBox", () => {
  test("returns null for empty label", () => {
    expect(fitLabelInBox(ctx, "", 100, 40, "sans-serif", 400, 14, 7, 1)).toBeNull();
  });

  test("single short word fits unwrapped", () => {
    const r = fitLabelInBox(ctx, "hello", 200, 40, "sans-serif", 400, 14, 7, 1);
    expect(r?.lines).toEqual(["hello"]);
  });

  test("very long unbroken text ellipsizes at min font", () => {
    const r = fitLabelInBox(ctx, "a".repeat(200), 60, 14, "sans-serif", 400, 14, 7, 1);
    expect(r?.lines[0].endsWith("...")).toBe(true);
  });
});
