import { create } from "zustand";
import { logger } from "@/lib/logger";
import {
  getOrCreateDeviceId,
  loadSyncContext,
  saveSyncContext,
} from "@/lib/userContextStorage";

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

interface InitializeOptions {
  force?: boolean;
}

interface SyncSetState {
  deviceId: string;
  contextUserSub: string | null;
  syncIds: string[];
  hasInitialized: boolean;
  pendingSwap: PendingSwap | null;
  // Map<syncId, sourceId> — populated by useSyncs poller; not persisted.
  sourceMap: Map<string, string>;

  hydrateForUser: (userSub: string) => void;
  load: (syncId: string) => void;
  unload: (syncId: string) => void;
  addSyncId: (syncId: string) => void;
  removeSyncId: (syncId: string) => void;
  setSyncIds: (ids: string[]) => void;
  setActiveSet: (ids: string[]) => void;
  onSyncCompleted: (run: SyncRunSummary, sourceLabel: string) => void;
  undoSwap: () => void;
  pruneInvalid: (validSyncIds: Set<string>) => void;
  registerSourceMap: (m: Map<string, string>) => void;
  initializeIfNeeded: (seedSyncIds?: string[], options?: InitializeOptions) => Promise<void>;
}

function persistContext(state: SyncSetState): void {
  if (!state.contextUserSub) return;
  saveSyncContext(state.contextUserSub, state.deviceId, {
    syncIds: state.syncIds,
    hasInitialized: state.hasInitialized,
  });
}

function normalizeSyncIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export const useSyncSetStore = create<SyncSetState>()((set, get) => ({
  deviceId: getOrCreateDeviceId(),
  contextUserSub: null,
  syncIds: [],
  hasInitialized: false,
  pendingSwap: null,
  sourceMap: new Map(),

  hydrateForUser: (userSub) => {
    const current = get();
    if (current.contextUserSub === userSub) return;
    const persisted = loadSyncContext(userSub, current.deviceId);
    set({
      contextUserSub: userSub,
      syncIds: persisted.syncIds,
      hasInitialized: persisted.hasInitialized,
      pendingSwap: null,
    });
    logger.info("sync_context_hydrated", {
      userSub,
      deviceId: current.deviceId,
      syncCount: persisted.syncIds.length,
    });
  },

  load: (syncId) => {
    set((s) => (
      s.syncIds.includes(syncId) ? {} : { syncIds: [...s.syncIds, syncId] }
    ));
    persistContext(get());
  },

  unload: (syncId) => {
    set((s) => ({ syncIds: s.syncIds.filter((id) => id !== syncId) }));
    persistContext(get());
  },

  addSyncId: (syncId: string) => {
    set((s) => (
      s.syncIds.includes(syncId) ? {} : { syncIds: [...s.syncIds, syncId] }
    ));
    persistContext(get());
  },

  removeSyncId: (syncId: string) => {
    set((s) => ({ syncIds: s.syncIds.filter((id) => id !== syncId) }));
    persistContext(get());
  },

  setSyncIds: (ids: string[]) => {
    set({ syncIds: normalizeSyncIds(ids) });
    persistContext(get());
  },

  setActiveSet: (ids) => {
    set({ syncIds: normalizeSyncIds(ids) });
    persistContext(get());
  },

  onSyncCompleted: (run, sourceLabel) => {
    const state = get();
    const active = state.syncIds.find(
      (id) => state.sourceMap.get(id) === run.source_id,
    );
    if (active) {
      set({
        syncIds: state.syncIds.map((id) => (id === active ? run.id : id)),
        pendingSwap: {
          newSyncId: run.id,
          replacedSyncId: active,
          sourceLabel,
          expiresAt: Date.now() + 5000,
        },
      });
      persistContext(get());
      logger.debug("active_set_swap", { from: active, to: run.id });
    } else {
      logger.debug("active_set_new_source_not_loaded", { syncId: run.id });
    }
  },

  undoSwap: () => {
    const state = get();
    if (!state.pendingSwap) return;
    const { newSyncId, replacedSyncId } = state.pendingSwap;
    set({
      syncIds: state.syncIds.map((id) => (id === newSyncId ? replacedSyncId : id)),
      pendingSwap: null,
    });
    persistContext(get());
  },

  pruneInvalid: (valid) => {
    set((s) => ({ syncIds: s.syncIds.filter((id) => valid.has(id)) }));
    persistContext(get());
  },

  registerSourceMap: (m) => set({ sourceMap: m }),

  initializeIfNeeded: async (seedSyncIds = [], options = {}) => {
    const state = get();
    if (state.syncIds.length > 0) {
      if (!state.hasInitialized) {
        set({ hasInitialized: true });
        persistContext(get());
      }
      return;
    }
    if (state.hasInitialized && !options.force) return;
    const nextSyncIds = normalizeSyncIds(seedSyncIds);
    set({
      syncIds: nextSyncIds,
      hasInitialized: true,
    });
    logger.info("sync_context_initialized", {
      userSub: state.contextUserSub,
      deviceId: state.deviceId,
      syncCount: nextSyncIds.length,
      force: Boolean(options.force),
    });
    persistContext(get());
  },
}));
