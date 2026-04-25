import { create } from "zustand";

export type Toast = {
  id: string;
  message: string;
  /** Optional undo action; when set, the dock renders an Undo button. */
  onUndo?: () => void;
  /** Auto-dismiss after this many ms. Cleared by `dismiss(id)` or by Undo. */
  ttlMs: number;
};

type State = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
};

export const useToastStore = create<State>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    setTimeout(() => {
      if (get().toasts.find((x) => x.id === id)) {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }
    }, t.ttlMs);
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
