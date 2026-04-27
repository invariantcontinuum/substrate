import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CommunityRef = { cache_key: string; community_index: number };

/** Pre-MVP shape: sync_ids is the canonical scope. Each sync row carries
 * its own source_id, so the UI can mix snapshots from multiple sources.
 * ``file_ids`` is an optional whitelist (null/undefined = include every
 * file in the active sync set; empty array = no files). */
export type ActiveChatContext = {
  sync_ids: string[];
  community_ids: CommunityRef[];
  file_ids?: string[] | null;
};

type State = {
  active: ActiveChatContext | null;
  setActive: (next: ActiveChatContext | null) => void;
};

export const useChatContextStore = create<State>()(
  persist(
    (set) => ({
      active: null,
      setActive: (next) => set({ active: next }),
    }),
    {
      name: "substrate.chat-context.v2",
      partialize: (s) => ({ active: s.active }),
    },
  ),
);
