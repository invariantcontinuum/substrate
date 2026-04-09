import { create } from "zustand";

export type ModalName =
  | "sources"
  | "enrichment"
  | "search"
  | "settings"
  | "user"
  | "policies"
  | "adrs"
  | "drift"
  | "query"
  | null;

interface UIState {
  sidebarOpen: boolean;
  activeModal: ModalName;
  openModal: (modal: ModalName) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  activeModal: null,
  openModal: (activeModal) => set({ activeModal, sidebarOpen: false }),
  closeModal: () => set({ activeModal: null }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
