import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Per-user default seed — frozen onto each new chat thread at creation.
 * Per spec D-1/D-2 the seed is the only settings-level chat-context
 * surface; communities and per-file selections are per-thread, in the
 * pill modal next to the chat composer.
 *
 * ``sync_ids`` carries individual snapshot picks. ``source_ids`` lets a
 * user say "always use the latest snapshot of this source on every new
 * chat" — the gateway resolves a source_id to its current
 * ``last_sync_id`` at thread-creation time.
 */
export type ActiveChatContext = {
  sync_ids:   string[];
  source_ids: string[];
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
      // Bumped from v2 — old shape carried community_ids / file_ids
      // which the new schema does not understand. Returning users get
      // a clean re-seed from the server on the next /active GET.
      name: "substrate.chat-context.v3",
      partialize: (s) => ({ active: s.active }),
    },
  ),
);
