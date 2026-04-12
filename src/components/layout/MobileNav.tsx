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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: "var(--overlay-modal)",
          backdropFilter: "blur(4px)",
          animation: "fadeIn 0.12s ease both",
        }}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 left-0 bottom-0 z-50 flex flex-col"
        style={{
          width: "min(280px, 85vw)",
          background: "var(--bg-surface)",
          borderRight: "1px solid var(--border)",
          animation: "slideInLeft 0.22s cubic-bezier(0.4, 0, 0.2, 1) both",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ height: 48, borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 26, height: 26, borderRadius: "var(--radius-sm)",
                background: "var(--accent-soft)", border: "1px solid var(--accent-medium)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Brain size={13} color="var(--accent)" />
            </div>
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Substrate
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
              background: "var(--bg-hover)", color: "var(--text-muted)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Items */}
        <div className="flex flex-col gap-px px-2 py-2 flex-1 overflow-y-auto">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => go(it.modal)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] text-left"
              style={{
                color: "var(--text-secondary)", border: "none",
                background: "transparent", cursor: "pointer",
                transition: "background 0.1s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <it.icon size={17} strokeWidth={1.5} />
              {it.label}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={() => go("user")}
            style={{
              width: 30, height: 30, borderRadius: "50%", border: "none",
              background: "var(--accent-soft)", outline: "1px solid var(--accent-medium)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--accent-text)", fontWeight: 600 }}>{initial}</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => go("settings")}
            style={{
              width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", background: "transparent", cursor: "pointer",
            }}
          >
            <Settings size={16} color="var(--text-muted)" />
          </button>
        </div>
      </div>
    </>
  );
}
