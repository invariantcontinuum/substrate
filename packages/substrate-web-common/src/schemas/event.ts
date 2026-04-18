import { z } from "zod";

export const SseEvent = z.object({
  id: z.string(),
  type: z.string(),
  sync_id: z.string().uuid().nullable().optional(),
  source_id: z.string().uuid().nullable().optional(),
  payload: z.record(z.string(), z.any()),
  emitted_at: z.string(),
});
export type SseEventT = z.infer<typeof SseEvent>;
