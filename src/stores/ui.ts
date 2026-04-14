import { create } from "zustand";

export type ModalName =
  | "sources"
  | "enrichment"
  | "search"
  // Settings are integrated as a tab inside the `user` modal, not a
  // separate top-level modal.
  | "user"
  | "policies"
  | "adrs"
  | "drift"
  | "query"
  | "nodeDetail"
  | null;

interface UIState {
  sidebarOpen: boolean;
  activeModal: ModalName;
  openModal: (modal: ModalName) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  defaultRepoUrl: string | null;
  setDefaultRepoUrl: (url: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  activeModal: null,
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  defaultRepoUrl: null,
  setDefaultRepoUrl: (defaultRepoUrl) => set({ defaultRepoUrl }),
}));
