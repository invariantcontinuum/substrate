import { z } from "zod";

/** Mirror of the Python sources row shape returned by GET /api/sources. */
export const Source = z.object({
  id: z.string().uuid(),
  source_type: z.string(),
  owner: z.string(),
  name: z.string(),
  url: z.string(),
  default_branch: z.string().nullable().optional(),
  config: z.record(z.string(), z.any()).nullable().optional(),
  enabled: z.boolean().optional(),
  last_sync_id: z.string().uuid().nullable().optional(),
  last_synced_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});
export type SourceT = z.infer<typeof Source>;
