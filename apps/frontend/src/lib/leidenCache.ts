/**
 * Client-side canonical cache-key helper. Must bit-match the Python side
 * in ``services/graph/src/graph/leiden_config.py::LeidenConfig.canonical_hash``
 * so a URL containing a cache key resolves to the same row regardless of
 * which client computed it.
 */
export interface LeidenConfig {
  resolution: number;
  beta: number;
  iterations: number;
  min_cluster_size: number;
  seed: number;
}

/**
 * Stringify a LeidenConfig with keys sorted and no whitespace. Mirrors
 * Python's ``json.dumps(..., sort_keys=True, separators=(",", ":"))`` byte
 * for byte, including ``JSON.stringify``'s canonical number formatting
 * (integers lose ``.0``, floats keep it — the server does the same).
 */
function canonicalConfigJson(cfg: LeidenConfig): string {
  const keys = Object.keys(cfg).sort() as (keyof LeidenConfig)[];
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${JSON.stringify(cfg[k])}`,
  );
  return `{${parts.join(",")}}`;
}

/**
 * ``sha256(sorted_ids_joined_by_pipe || "::" || canonical_json(config))``
 * returned as lowercase hex. Uses ``crypto.subtle.digest``, available in
 * every modern browser over https (or localhost during dev).
 */
export async function canonicalCacheKey(
  syncIds: string[],
  cfg: LeidenConfig,
): Promise<string> {
  const sorted = [...syncIds].sort().join("|");
  const canonical = canonicalConfigJson(cfg);
  const input = `${sorted}::${canonical}`;
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
