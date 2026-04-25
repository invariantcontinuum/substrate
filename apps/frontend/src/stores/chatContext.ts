import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CommunityRef = { cache_key: string; community_index: number };
export type ActiveChatContext = {
  source_id: string;
  snapshot_ids: string[];
  community_ids: CommunityRef[];
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
      name: "substrate.chat-context.v1",
      partialize: (s) => ({ active: s.active }),
    },
  ),
);
