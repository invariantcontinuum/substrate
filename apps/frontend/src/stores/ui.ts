import { create } from "zustand";

export type ModalName =
  | "enrichment"
  | "user"
  | "policies"
  | "adrs"
  | "drift"
  | "query"
  | "nodeDetail"
  | "settings"
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
  sourcesPageTarget: { sourceId: string; expandSyncId: string | null } | null;
  setSourcesPageTarget: (target: { sourceId: string; expandSyncId: string | null } | null) => void;
  activeView: "graph" | "sources" | "chat" | "account";
  setActiveView: (v: "graph" | "sources" | "chat" | "account") => void;
  /**
   * Bump-counter consumed by the GraphSearchAnchor to open its
   * header-anchored dropdown. Kept as a sequence (not a boolean)
   * so successive Ctrl+K presses always trigger an open even if
   * the dropdown is mounted; the anchor owns its own open flag.
   * Starts at 0 so the initial mount doesn't auto-open the popover.
   */
  graphSearchOpenSeq: number;
  /** Bump ``graphSearchOpenSeq`` so any mounted GraphSearchAnchor opens. */
  triggerGraphSearch: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  activeModal: null,
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  defaultRepoUrl: null,
  setDefaultRepoUrl: (defaultRepoUrl) => set({ defaultRepoUrl }),
  sourcesPageTarget: null,
  setSourcesPageTarget: (sourcesPageTarget) => set({ sourcesPageTarget }),
  activeView: "graph",
  setActiveView: (activeView) => set({ activeView }),
  graphSearchOpenSeq: 0,
  triggerGraphSearch: () => set((s) => ({ graphSearchOpenSeq: s.graphSearchOpenSeq + 1 })),
}));
