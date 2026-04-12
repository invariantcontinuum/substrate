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
        className="fixed inset-0 z-40"
        style={{
          background: "var(--overlay-modal)",
          backdropFilter: "blur(8px)",
          animation: "fadeIn 0.12s ease both",
        }}
        onClick={() => setSidebarOpen(false)}
      />

      <div
        className="fixed top-0 left-0 bottom-0 z-50 flex flex-col"
        style={{
          width: "min(300px, 85vw)",
          background: "var(--bg-surface)",
          boxShadow: "var(--neu-extruded)",
          animation: "slideInLeft 0.22s cubic-bezier(0.4, 0, 0.2, 1) both",
        }}
      >
        <div
          className="flex items-center justify-between px-5 shrink-0"
          style={{ height: 60 }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 32, height: 32, borderRadius: "var(--radius-md)",
                background: "var(--bg-surface)", boxShadow: "var(--neu-inset-deep)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Brain size={15} color="var(--accent)" />
            </div>
            <span className="text-[14px] font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              Substrate
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="neu-btn flex items-center justify-center"
            style={{
              width: 34, height: 34, borderRadius: "var(--radius-md)",
              background: "var(--bg-surface)", color: "var(--text-muted)",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-1 px-4 py-4 flex-1 overflow-y-auto">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => go(it.modal)}
              className="neu-btn flex items-center gap-3 px-4 py-3 text-[13px] text-left font-medium"
              style={{
                color: "var(--text-secondary)",
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-lg)",
              }}
            >
              <it.icon size={17} strokeWidth={1.6} />
              {it.label}
            </button>
          ))}
        </div>

        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
        >
          <button
            onClick={() => go("user")}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "var(--bg-surface)", boxShadow: "var(--neu-extruded-sm)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 700, fontFamily: "var(--font-display)" }}>{initial}</span>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => go("settings")}
            className="neu-btn flex items-center justify-center"
            style={{
              width: 36, height: 36, borderRadius: "var(--radius-md)",
              background: "var(--bg-surface)",
            }}
          >
            <Settings size={16} color="var(--text-muted)" />
          </button>
        </div>
      </div>
    </>
  );
}
