import { create } from "zustand";

export type ModalName =
  | "sources"
  | "enrichment"
  | "search"
  // Graph-rendering / clustering / layout configuration. Exposed via
  // the Graph item in the side nav.
  | "graph"
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
  sourcesModalTarget: { sourceId: string; expandSyncId: string | null } | null;
  setSourcesModalTarget: (target: { sourceId: string; expandSyncId: string | null } | null) => void;
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
  sourcesModalTarget: null,
  setSourcesModalTarget: (sourcesModalTarget) => set({ sourcesModalTarget }),
}));
