import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitBranch, Plug, MessageCircle, Shield,
  FileText, Activity, Terminal,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useUIStore, type ModalName } from "@/stores/ui";
import { useSyncSetStore } from "@/stores/syncSet";

// "settings" is no longer a top-level modal — it's a tab inside the
// user account modal. The account button at the footer of the rail is
// the single entry point to both.
// "sources" is now a full-page view (activeView toggle), not a modal.
const IMPLEMENTED = new Set(["sources", "enrichment", "chat", "user"]);

type NavAction = { kind: "modal"; modal: ModalName } | { kind: "view"; view: "graph" | "sources" | "chat" } | { kind: "navigate" };

interface NavItem {
  icon: typeof GitBranch;
  label: string;
  action: NavAction;
  active?: boolean;
}

const items: NavItem[] = [
  { icon: GitBranch, label: "Graph",      action: { kind: "view", view: "graph" }, active: true },
  { icon: Plug,      label: "Sources",    action: { kind: "view",  view: "sources" } },
  { icon: MessageCircle, label: "Chat",   action: { kind: "view", view: "chat" } },
  { icon: Shield,    label: "Policies",   action: { kind: "modal", modal: "policies" } },
  { icon: FileText,  label: "ADRs",       action: { kind: "modal", modal: "adrs" } },
  { icon: Activity,  label: "Drift",      action: { kind: "modal", modal: "drift" } },
  { icon: Terminal,  label: "Query",      action: { kind: "modal", modal: "query" } },
];

export function Sidebar() {
  const navigate = useNavigate();
  const openModal = useUIStore((s) => s.openModal);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const auth = useAuth();
  const initial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";
  const [hov, setHov] = useState<string | null>(null);
  const loadedSourceCount = useSyncSetStore((s) => {
    const unique = new Set<string>();
    for (const syncId of s.syncIds) {
      unique.add(s.sourceMap.get(syncId) ?? `sync:${syncId}`);
    }
    return unique.size;
  });

  const handleNav = (action: NavAction) => {
    if (action.kind === "modal") {
      openModal(action.modal);
      return;
    }
    if (action.kind === "view") {
      const path = action.view === "graph" ? "/graph" : action.view === "sources" ? "/sources" : "/chat";
      navigate(path);
      setActiveView(action.view);
      return;
    }
  };

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
        const modalName = it.action.kind === "modal" ? (it.action.modal as string) : "";
        const coming = it.action.kind === "modal" && !IMPLEMENTED.has(modalName);

        return (
          <div
            key={it.label}
            onMouseEnter={() => setHov(it.label)}
            onMouseLeave={() => setHov(null)}
            className="side-nav-item"
          >
            <button
              onClick={() => handleNav(it.action)}
              className="side-nav-btn"
            >
              <span className="nav-icon-wrap">
                <it.icon size={16} />
                {it.label === "Sources" && loadedSourceCount > 0 && (
                  <span className="nav-badge">{loadedSourceCount}</span>
                )}
              </span>
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
