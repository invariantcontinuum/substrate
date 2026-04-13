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
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.12s_ease_both]"
        onClick={() => setSidebarOpen(false)}
      />

      <div
        className="fixed top-0 left-0 bottom-0 z-50 flex flex-col w-[min(300px,85vw)] bg-[var(--bg-glass)] backdrop-blur-md border-r border-[var(--border-glass)] animate-[slideInLeft_0.22s_cubic-bezier(0.4,0,0.2,1)_both]"
      >
        <div
          className="flex items-center justify-between px-6 shrink-0 h-16 border-b border-border"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--accent-soft)] border border-[var(--accent-medium)]"
            >
              <Brain size={15} className="text-[var(--accent-brand)]" />
            </div>
            <span className="text-sm font-bold text-[var(--text-primary)] font-display">
              Substrate
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex items-center justify-center w-[34px] h-[34px] rounded-md bg-white/[0.04] text-[var(--text-muted)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5 px-5 py-5 flex-1 overflow-y-auto">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => go(it.modal)}
              className="flex items-center gap-3 px-4 py-3 text-[13px] text-left font-medium text-[var(--text-secondary)] bg-transparent rounded-lg transition-colors duration-150 hover:bg-white/[0.04]"
            >
              <it.icon size={17} strokeWidth={1.6} />
              {it.label}
            </button>
          ))}
        </div>

        <div
          className="flex items-center gap-3 px-6 py-5 shrink-0 border-t border-border"
        >
          <button
            onClick={() => go("user")}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-[var(--accent-soft)] outline outline-1 outline-[var(--accent-medium)]"
          >
            <span className="text-[13px] font-bold text-[var(--accent-brand)] font-display">{initial}</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => go("settings")}
            className="flex items-center justify-center w-9 h-9 rounded-md bg-white/[0.04]"
          >
            <Settings size={16} className="text-[var(--text-muted)]" />
          </button>
        </div>
      </div>
    </>
  );
}
