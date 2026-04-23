import type cytoscape from "cytoscape";

let loaded: typeof cytoscape | null = null;

export async function loadCytoscape(): Promise<typeof cytoscape> {
  if (loaded) return loaded;
  const mod = await import("cytoscape");
  loaded = mod.default;
  return loaded;
}
