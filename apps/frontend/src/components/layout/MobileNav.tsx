import { useNavigate, useLocation } from "react-router-dom";
import { GitBranch, Plug, MessageCircle, User } from "lucide-react";
import { useUIStore, type ModalName } from "@/stores/ui";

// Settings live inside the Account modal as a tab — no dedicated
// bottom-nav slot for them on mobile.
// "sources" is now a full-page view toggled via activeView, not a modal.
type MobileNavAction =
  | { kind: "modal"; modal: ModalName }
  | { kind: "view"; view: "graph" | "sources" | "ask" };

const items: { icon: typeof GitBranch; label: string; action: MobileNavAction }[] = [
  { icon: GitBranch, label: "Graph",   action: { kind: "view",  view: "graph" } },
  { icon: Plug,      label: "Sources", action: { kind: "view",  view: "sources" } },
  { icon: MessageCircle, label: "Ask", action: { kind: "view",  view: "ask" } },
  { icon: User,      label: "Account", action: { kind: "modal", modal: "user" } },
];

export function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const openModal = useUIStore((s) => s.openModal);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const activeModal = useUIStore((s) => s.activeModal);

  const isActive = (action: MobileNavAction): boolean => {
    if (action.kind === "view") {
      const path = action.view === "graph" ? "/graph" : action.view === "sources" ? "/sources" : "/ask";
      return location.pathname.startsWith(path);
    }
    return activeModal === action.modal;
  };

  const handleNav = (action: MobileNavAction) => {
    if (action.kind === "modal") {
      openModal(action.modal);
      return;
    }
    const path = action.view === "graph" ? "/graph" : action.view === "sources" ? "/sources" : "/ask";
    navigate(path);
    setActiveView(action.view);
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
