import { create } from "zustand";

interface ChatState {
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  composerDraft: string;
  setComposerDraft: (v: string) => void;
  sendingTurn: boolean;
  setSendingTurn: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeThreadId: null,
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  composerDraft: "",
  setComposerDraft: (composerDraft) => set({ composerDraft }),
  sendingTurn: false,
  setSendingTurn: (sendingTurn) => set({ sendingTurn }),
}));
