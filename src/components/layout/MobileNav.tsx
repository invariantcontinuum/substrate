import { GitBranch, Plug, Sparkles, Search, User } from "lucide-react";
import { useUIStore, type ModalName } from "@/stores/ui";

// Settings live inside the Account modal as a tab — no dedicated
// bottom-nav slot for them on mobile.
// "sources" is now a full-page view toggled via activeView, not a modal.
type MobileNavAction =
  | { kind: "modal"; modal: ModalName }
  | { kind: "view"; view: "graph" | "sources" };

const items: { icon: typeof GitBranch; label: string; action: MobileNavAction }[] = [
  { icon: GitBranch, label: "Graph",      action: { kind: "view",  view: "graph" } },
  { icon: Plug,      label: "Sources",    action: { kind: "view",  view: "sources" } },
  { icon: Sparkles,  label: "Enrichment", action: { kind: "modal", modal: "enrichment" } },
  { icon: Search,    label: "Search",     action: { kind: "modal", modal: "search" } },
  { icon: User,      label: "Account",    action: { kind: "modal", modal: "user" } },
];

export function MobileNav() {
  const openModal = useUIStore((s) => s.openModal);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const handleNav = (action: MobileNavAction) => {
    if (action.kind === "modal") openModal(action.modal);
    else setActiveView(action.view);
  };

  return (
    <nav className="mobile-nav">
      {items.map((it) => (
        <button key={it.label} onClick={() => handleNav(it.action)} className="mobile-nav-item">
          <it.icon size={16} />
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
