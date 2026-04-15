import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { logger } from "@/lib/logger";

export interface SyncRunSummary {
  id: string;
  source_id: string;
  status: string;
}

export interface PendingSwap {
  newSyncId: string;
  replacedSyncId: string;
  sourceLabel: string;
  expiresAt: number;
}

interface SyncSetState {
  syncIds: string[];
  hasInitialized: boolean;
  pendingSwap: PendingSwap | null;
  // Map<syncId, sourceId> — populated by useSyncs poller; not persisted.
  sourceMap: Map<string, string>;

  load: (syncId: string) => void;
  unload: (syncId: string) => void;
  setActiveSet: (ids: string[]) => void;
  onSyncCompleted: (run: SyncRunSummary, sourceLabel: string) => void;
  undoSwap: () => void;
  pruneInvalid: (validSyncIds: Set<string>) => void;
  registerSourceMap: (m: Map<string, string>) => void;
  initializeIfNeeded: (token: string | undefined) => Promise<void>;
}

export const useSyncSetStore = create<SyncSetState>()(
  persist(
    (set, get) => ({
      syncIds: [],
      hasInitialized: false,
      pendingSwap: null,
      sourceMap: new Map(),

      load: (syncId) => set((s) =>
        s.syncIds.includes(syncId) ? {} : { syncIds: [...s.syncIds, syncId] }),

      unload: (syncId) => set((s) => ({ syncIds: s.syncIds.filter((id) => id !== syncId) })),

      setActiveSet: (ids) => set({ syncIds: ids }),

      onSyncCompleted: (run, sourceLabel) => {
        const state = get();
        const active = state.syncIds.find(
          (id) => state.sourceMap.get(id) === run.source_id);
        if (active) {
          set({
            syncIds: state.syncIds.map((id) => id === active ? run.id : id),
            pendingSwap: {
              newSyncId: run.id, replacedSyncId: active,
              sourceLabel, expiresAt: Date.now() + 5000,
            },
          });
          logger.info("active_set_swap", { from: active, to: run.id });
        } else {
          logger.info("active_set_new_source_not_loaded", { syncId: run.id });
        }
      },

      undoSwap: () => {
        const state = get();
        if (!state.pendingSwap) return;
        const { newSyncId, replacedSyncId } = state.pendingSwap;
        set({
          syncIds: state.syncIds.map((id) => id === newSyncId ? replacedSyncId : id),
          pendingSwap: null,
        });
      },

      pruneInvalid: (valid) => set((s) => ({
        syncIds: s.syncIds.filter((id) => valid.has(id)),
      })),

      registerSourceMap: (m) => set({ sourceMap: m }),

      initializeIfNeeded: async (_token) => {
        // Intentionally does NOT auto-load any snapshots. Canvas preserves
        // the last explicitly-loaded set from this browser/device via
        // localStorage. If localStorage is empty (new browser/device/private
        // window, or user cleared storage), the canvas stays empty — the
        // user picks what to load from the Sources modal.
        // pruneInvalid still runs from DashboardLayout to drop stale ids
        // before this is called.
        set({ hasInitialized: true });
      },
    }),
    {
      name: "substrate-sync-set",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ syncIds: s.syncIds, hasInitialized: s.hasInitialized }),
    },
  ),
);
