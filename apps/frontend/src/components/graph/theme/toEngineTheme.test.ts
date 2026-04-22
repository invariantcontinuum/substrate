import { describe, test, expect } from "vitest";
import { buildGraphTheme } from "./buildTheme";
import { graphThemeToEngineJson } from "./toEngineTheme";

// Walk the JSON tree but skip the *children of* free-form map containers
// (byType, byStatus). Their own KEY names are edge/node/status type strings
// from the graph data (e.g., "depends_on") — those pass through as Rust
// HashMap keys and are not subject to serde's struct-field camelCase rule.
// The regex must still catch snake_case on struct fields like "border_color".
function keysOf(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out.push(prefix + k);
    // Do not descend into free-form map containers when walking KEYS —
    // only their VALUES' property names need the Rust-field guarantee.
    if (k === "byType" || k === "byStatus") {
      for (const child of Object.values(v as Record<string, unknown>)) {
        out.push(...keysOf(child, prefix + k + ".*."));
      }
      continue;
    }
    out.push(...keysOf(v, prefix + k + "."));
  }
  return out;
}

describe("graphThemeToEngineJson", () => {
  test("every emitted struct-field key is camelCase (no snake_case)", () => {
    const json = graphThemeToEngineJson(buildGraphTheme("dark"));
    for (const k of keysOf(json)) {
      const leaf = k.split(".").pop()!;
      expect(leaf, `key "${k}" must be camelCase`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });

  test("dark theme default node carries size = max(halfWidth, halfHeight)", () => {
    const json = graphThemeToEngineJson(buildGraphTheme("dark")) as any;
    const def = json.nodes.default;
    expect(def.size).toBe(Math.max(def.halfWidth, def.halfHeight));
  });

  test("background is transparent (CSS grid shows through)", () => {
    const json = graphThemeToEngineJson(buildGraphTheme("dark")) as any;
    expect(json.background).toMatch(/rgba\(0\s*,\s*0\s*,\s*0\s*,\s*0\)/);
  });

  test("spotlight.dimOpacity = 0.28", () => {
    const json = graphThemeToEngineJson(buildGraphTheme("dark")) as any;
    expect(json.interaction.spotlight.dimOpacity).toBeCloseTo(0.28);
  });

  test("every byType node override has camelCase keys only", () => {
    const json = graphThemeToEngineJson(buildGraphTheme("light")) as any;
    for (const [type, v] of Object.entries(json.nodes.byType)) {
      for (const k of Object.keys(v as object)) {
        expect(k, `${type}.${k} must be camelCase`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });
});
