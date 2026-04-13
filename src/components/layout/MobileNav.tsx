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
      <div
        className="fixed inset-0 z-40 bg-black/50 animate-[fadeIn_0.12s_ease_both]"
        onClick={() => setSidebarOpen(false)}
      />

      <div className="fixed top-0 left-0 bottom-0 z-50 flex flex-col w-64 bg-background border-r border-border animate-[slideInLeft_0.22s_ease_both]">
        <div className="flex items-center justify-between px-4 h-14 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded bg-primary/10 border border-primary/20">
              <Brain size={15} className="text-primary" />
            </div>
            <span className="text-sm font-bold">Substrate</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-muted text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1 px-3 py-4 flex-1 overflow-y-auto">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => go(it.modal)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm text-left font-medium text-muted-foreground rounded-md hover:bg-muted"
            >
              <it.icon size={17} strokeWidth={1.6} />
              {it.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 px-4 py-4 border-t border-border">
          <button
            onClick={() => go("user")}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 border border-primary/20"
          >
            <span className="text-sm font-bold text-primary">{initial}</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => go("settings")}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-muted"
          >
            <Settings size={16} className="text-muted-foreground" />
          </button>
        </div>
      </div>
    </>
  );
}
