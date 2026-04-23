import { describe, test, expect } from "vitest";
import { TYPE_STYLES, DEFAULT_STYLE } from "./typeStyles";
import { NODE_TYPES } from "./palette";

describe("typeStyles", () => {
  test("every NodeType has a shape entry", () => {
    for (const t of NODE_TYPES) {
      expect(TYPE_STYLES[t], `missing TypeShape for ${t}`).toBeDefined();
    }
  });

  test("all half-widths/heights are positive", () => {
    for (const t of NODE_TYPES) {
      expect(TYPE_STYLES[t].halfWidth).toBeGreaterThan(0);
      expect(TYPE_STYLES[t].halfHeight).toBeGreaterThan(0);
    }
    expect(DEFAULT_STYLE.halfWidth).toBeGreaterThan(0);
    expect(DEFAULT_STYLE.halfHeight).toBeGreaterThan(0);
  });

  test("specialty shapes match legacy", () => {
    expect(TYPE_STYLES.database.shape).toBe("barrel");
    expect(TYPE_STYLES.cache.shape).toBe("barrel");
    expect(TYPE_STYLES.policy.shape).toBe("diamond");
  });
});
