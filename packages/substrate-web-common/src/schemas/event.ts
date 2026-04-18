import { z } from "zod";

/**
 * Mirrors `substrate_common.sse.Event` (pydantic). The Python side gives
 * `id`, `payload`, `emitted_at` default factories — they are ALWAYS present
 * on the wire, but the schema marks only `type` as required to match
 * pydantic exactly. `make check-contracts` asserts parity.
 */
export const SseEvent = z.object({
  id: z.string().optional(),
  type: z.string(),
  sync_id: z.string().uuid().nullable().optional(),
  source_id: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.any()).optional(),
  emitted_at: z.string().optional(),
});
export type SseEventT = z.infer<typeof SseEvent>;
