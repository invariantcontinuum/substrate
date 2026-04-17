import { GitBranch, Plug, Search, User } from "lucide-react";
import { useUIStore, type ModalName } from "@/stores/ui";

// Settings live inside the Account modal as a tab — no dedicated
// bottom-nav slot for them on mobile.
// "sources" is now a full-page view toggled via activeView, not a modal.
type MobileNavAction =
  | { kind: "modal"; modal: ModalName }
  | { kind: "view"; view: "graph" | "sources" };

const items: { icon: typeof GitBranch; label: string; action: MobileNavAction }[] = [
  { icon: GitBranch, label: "Graph",   action: { kind: "view",  view: "graph" } },
  { icon: Plug,      label: "Sources", action: { kind: "view",  view: "sources" } },
  { icon: Search,    label: "Search",  action: { kind: "modal", modal: "search" } },
  { icon: User,      label: "Account", action: { kind: "modal", modal: "user" } },
];

export function MobileNav() {
  const openModal = useUIStore((s) => s.openModal);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const activeView = useUIStore((s) => s.activeView);
  const activeModal = useUIStore((s) => s.activeModal);

  const isActive = (action: MobileNavAction): boolean => {
    if (action.kind === "view") return activeView === action.view;
    return activeModal === action.modal;
  };

  const handleNav = (action: MobileNavAction) => {
    if (action.kind === "modal") openModal(action.modal);
    else setActiveView(action.view);
  };

  return (
    <nav className="mobile-nav" aria-label="Primary">
      {items.map((it) => {
        const active = isActive(it.action);
        return (
          <button
            key={it.label}
            onClick={() => handleNav(it.action)}
            className={`mobile-nav-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={it.label}
          >
            <it.icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
