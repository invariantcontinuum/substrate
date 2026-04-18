import { z } from "zod";

/** Mirror of the Python sync_runs row shape returned by GET /api/syncs. */
export const SyncStatus = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type SyncStatusT = z.infer<typeof SyncStatus>;

export const SyncRun = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  status: SyncStatus,
  ref: z.string().nullable().optional(),
  config_snapshot: z.record(z.string(), z.any()).optional(),
  progress_done: z.number().nullable().optional(),
  progress_total: z.number().nullable().optional(),
  progress_meta: z.record(z.string(), z.any()).nullable().optional(),
  stats: z.record(z.string(), z.any()).nullable().optional(),
  schedule_id: z.number().nullable().optional(),
  triggered_by: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string(),
});
export type SyncRunT = z.infer<typeof SyncRun>;

export const SyncIssue = z.object({
  id: z.number(),
  level: z.enum(["info", "warning", "error"]),
  phase: z.string(),
  code: z.string(),
  message: z.string(),
  context: z.record(z.string(), z.any()),
  occurred_at: z.string(),
});
export type SyncIssueT = z.infer<typeof SyncIssue>;
