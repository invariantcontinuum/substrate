import { useState } from "react";
import {
  GitBranch, Plug, Sparkles, Search, Shield,
  FileText, Activity, Terminal,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useUIStore, type ModalName } from "@/stores/ui";

// "settings" is no longer a top-level modal — it's a tab inside the
// user account modal. The account button at the footer of the rail is
// the single entry point to both.
const IMPLEMENTED = new Set(["sources", "enrichment", "search", "user"]);

interface NavItem {
  icon: typeof GitBranch;
  label: string;
  modal: ModalName | "navigate";
  active?: boolean;
}

const items: NavItem[] = [
  { icon: GitBranch, label: "Graph",      modal: "navigate", active: true },
  { icon: Plug,      label: "Sources",    modal: "sources" },
  { icon: Sparkles,  label: "Enrichment", modal: "enrichment" },
  { icon: Search,    label: "Search",     modal: "search" },
  { icon: Shield,    label: "Policies",   modal: "policies" },
  { icon: FileText,  label: "ADRs",       modal: "adrs" },
  { icon: Activity,  label: "Drift",      modal: "drift" },
  { icon: Terminal,  label: "Query",      modal: "query" },
];

export function Sidebar() {
  const openModal = useUIStore((s) => s.openModal);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const auth = useAuth();
  const initial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";
  const [hov, setHov] = useState<string | null>(null);

  return (
    <nav className="side-nav">
      <button
        type="button"
        onClick={toggleSidebar}
        className="side-nav-collapse"
        title="Hide sidebar"
        aria-label="Hide sidebar"
      >
        <ChevronLeft size={16} />
      </button>

      {items.map((it) => {
        const coming = it.modal !== "navigate" && !IMPLEMENTED.has(it.modal as string);

        return (
          <div
            key={it.label}
            onMouseEnter={() => setHov(it.label)}
            onMouseLeave={() => setHov(null)}
            className="side-nav-item"
          >
            <button
              onClick={() => it.modal !== "navigate" && openModal(it.modal)}
              className="side-nav-btn"
            >
              <it.icon size={16} />
              <span>{it.label}</span>
              {coming && <span className="side-nav-badge">soon</span>}
            </button>

            {hov === it.label && (
              <div className="side-nav-tooltip">{it.label}</div>
            )}
          </div>
        );
      })}

      <div className="side-nav-spacer" />

      <div
        className="side-nav-footer"
        onMouseEnter={() => setHov("__u")}
        onMouseLeave={() => setHov(null)}
      >
        <button
          onClick={() => openModal("user")}
          className="side-nav-avatar"
          title="Account"
          aria-label="Account"
        >
          {initial}
        </button>
        {hov === "__u" && (
          <div className="side-nav-tooltip">Account</div>
        )}
      </div>
    </nav>
  );
}
