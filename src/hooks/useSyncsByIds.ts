// frontend/src/hooks/useSyncsByIds.ts
//
// Provides a Map<id, SyncRun> for an arbitrary list of sync IDs.
// Thin wrapper over useLoadedSyncs (array-by-index) that converts the
// result into a Map keyed by sync ID for O(1) lookup by callers.
//
// Used by UnifiedToolbar to determine per-snapshot status without
// restricting the lookup to the currently-loaded set.

import { useLoadedSyncs } from "./useLoadedSyncs";
import type { SyncRun } from "./useSyncs";

export function useSyncsByIds(ids: string[]): { syncsById: Map<string, SyncRun> } {
  const results = useLoadedSyncs(ids);
  const syncsById = new Map<string, SyncRun>();
  ids.forEach((id, idx) => {
    const run = results[idx];
    if (run) syncsById.set(id, run);
  });
  return { syncsById };
}
