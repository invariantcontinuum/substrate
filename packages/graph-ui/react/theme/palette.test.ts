import { describe, test, expect } from "vitest";
import { LIGHT, DARK, type Palette, NODE_TYPES, EDGE_TYPES } from "./palette";

describe("palette", () => {
  test("light and dark have identical top-level keys", () => {
    const lk = Object.keys(LIGHT).sort();
    const dk = Object.keys(DARK).sort();
    expect(lk).toEqual(dk);
  });

  test("typeBorders is exhaustive over NODE_TYPES in both palettes", () => {
    for (const t of NODE_TYPES) {
      expect(LIGHT.typeBorders[t], `LIGHT missing border for ${t}`).toBeDefined();
      expect(DARK.typeBorders[t],  `DARK missing border for ${t}`).toBeDefined();
    }
  });

  test("edgeAccents is exhaustive over EDGE_TYPES in both palettes", () => {
    for (const t of EDGE_TYPES) {
      expect(LIGHT.edgeAccents[t]?.line, `LIGHT missing line for ${t}`).toBeDefined();
      expect(LIGHT.edgeAccents[t]?.arrow,`LIGHT missing arrow for ${t}`).toBeDefined();
      expect(DARK.edgeAccents[t]?.line,  `DARK missing line for ${t}`).toBeDefined();
      expect(DARK.edgeAccents[t]?.arrow, `DARK missing arrow for ${t}`).toBeDefined();
    }
  });

  test("glass fill is one uniform color per palette", () => {
    expect(LIGHT.nodeGlassFill).toMatch(/^rgba?\(/);
    expect(DARK.nodeGlassFill).toMatch(/^rgba?\(/);
  });

  test("Palette type is satisfied by LIGHT at compile time", () => {
    const _p: Palette = LIGHT;
    expect(_p).toBeDefined();
  });
});
