import { create } from "zustand";

export interface StreamingTurn {
  threadId: string;
  messageId: string;
  content: string;
}

interface ChatState {
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  composerDraft: string;
  setComposerDraft: (v: string) => void;
  sendingTurn: boolean;
  setSendingTurn: (v: boolean) => void;
  streamingTurn: StreamingTurn | null;
  setStreamingTurn: (next: StreamingTurn | null) => void;
  appendStreamingDelta: (delta: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeThreadId: null,
  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  composerDraft: "",
  setComposerDraft: (composerDraft) => set({ composerDraft }),
  sendingTurn: false,
  setSendingTurn: (sendingTurn) => set({ sendingTurn }),
  streamingTurn: null,
  setStreamingTurn: (streamingTurn) => set({ streamingTurn }),
  appendStreamingDelta: (delta) =>
    set((s) => s.streamingTurn
      ? { streamingTurn: { ...s.streamingTurn, content: s.streamingTurn.content + delta } }
      : {}),
}));
