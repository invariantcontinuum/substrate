import { GitBranch, Plug, Sparkles, Search, User } from "lucide-react";
import { useUIStore, type ModalName } from "@/stores/ui";

// Settings live inside the Account modal as a tab — no dedicated
// bottom-nav slot for them on mobile.
const items: { icon: typeof GitBranch; label: string; modal: ModalName }[] = [
  { icon: GitBranch, label: "Graph",      modal: "graph" },
  { icon: Plug,      label: "Sources",    modal: "sources" },
  { icon: Sparkles,  label: "Enrichment", modal: "enrichment" },
  { icon: Search,    label: "Search",     modal: "search" },
  { icon: User,      label: "Account",    modal: "user" },
];

export function MobileNav() {
  const open = useUIStore((s) => s.openModal);

  return (
    <nav className="mobile-nav">
      {items.map((it) => (
        <button key={it.label} onClick={() => open(it.modal)} className="mobile-nav-item">
          <it.icon size={16} />
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
