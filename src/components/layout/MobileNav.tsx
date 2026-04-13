import {
  GitBranch, Plug, Sparkles, Search, Shield,
  FileText, Activity, Terminal, Settings, X, Brain,
} from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useUIStore, type ModalName } from "@/stores/ui";

const items: { icon: typeof GitBranch; label: string; modal: ModalName | "navigate" }[] = [
  { icon: GitBranch, label: "Graph",      modal: "navigate" },
  { icon: Plug,      label: "Sources",    modal: "sources" },
  { icon: Sparkles,  label: "Enrichment", modal: "enrichment" },
  { icon: Search,    label: "Search",     modal: "search" },
  { icon: Shield,    label: "Policies",   modal: "policies" },
  { icon: FileText,  label: "ADRs",       modal: "adrs" },
  { icon: Activity,  label: "Drift",      modal: "drift" },
  { icon: Terminal,  label: "Query",      modal: "query" },
];

export function MobileNav() {
  const { sidebarOpen, setSidebarOpen, openModal } = useUIStore();
  const auth = useAuth();
  const initial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";

  const go = (modal: ModalName | "navigate") => {
    setSidebarOpen(false);
    if (modal !== "navigate") openModal(modal);
  };

  if (!sidebarOpen) return null;

  return (
    <>
      <div onClick={() => setSidebarOpen(false)} />

      <div>
        <div>
          <div>
            <div>
              <Brain size={15} />
            </div>
            <span>Substrate</span>
          </div>
          <button onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div>
          {items.map((it) => (
            <button key={it.label} onClick={() => go(it.modal)}>
              <it.icon size={17} strokeWidth={1.6} />
              {it.label}
            </button>
          ))}
        </div>

        <div>
          <button onClick={() => go("user")}>{initial}</button>
          <div />
          <button onClick={() => go("settings")}>
            <Settings size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
