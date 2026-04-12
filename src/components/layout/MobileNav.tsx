import { GitBranch, Plug, Sparkles, Search, Shield, FileText, Activity, Terminal, Settings, X, Brain } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { useUIStore, type ModalName } from "@/stores/ui";

const menuItems: { icon: typeof GitBranch; label: string; modal: ModalName | "navigate" }[] = [
  { icon: GitBranch, label: "Graph", modal: "navigate" },
  { icon: Plug, label: "Sources", modal: "sources" },
  { icon: Sparkles, label: "Enrichment", modal: "enrichment" },
  { icon: Search, label: "Search", modal: "search" },
  { icon: Shield, label: "Policies", modal: "policies" },
  { icon: FileText, label: "ADRs", modal: "adrs" },
  { icon: Activity, label: "Drift", modal: "drift" },
  { icon: Terminal, label: "Query", modal: "query" },
];

export function MobileNav() {
  const { sidebarOpen, setSidebarOpen, openModal } = useUIStore();
  const auth = useAuth();
  const userInitial = auth.user?.profile?.name?.[0]?.toUpperCase() ?? "U";

  const handleClick = (modal: ModalName | "navigate") => {
    setSidebarOpen(false);
    if (modal !== "navigate") openModal(modal);
  };

  if (!sidebarOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", animation: "fadeIn 0.15s ease-out both" }}
        onClick={() => setSidebarOpen(false)}
      />
      <div
        className="fixed top-0 left-0 bottom-0 z-50 flex flex-col"
        style={{ width: 280, background: "var(--bg-surface)", borderRight: "1px solid var(--border)", animation: "slideInLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1) both" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "var(--accent-soft)", border: "1px solid var(--accent-medium)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Brain size={14} color="var(--accent)" />
            </div>
            <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Substrate</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} style={{ color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Menu items */}
        <div className="flex flex-col gap-0.5 px-3 flex-1">
          {menuItems.map((item) => (
            <button
              key={item.label}
              onClick={() => handleClick(item.modal)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors text-left"
              style={{ color: "var(--text-secondary)" }}
            >
              <item.icon size={18} strokeWidth={1.5} />
              {item.label}
            </button>
          ))}
        </div>

        {/* Footer — account + settings */}
        <div className="px-3 py-3 flex items-center gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => handleClick("user")}
            className="flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-soft)", border: "1px solid var(--accent-medium)" }}
          >
            <span style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 600 }}>{userInitial}</span>
          </button>
          <div className="flex-1" />
          <button onClick={() => handleClick("settings")}>
            <Settings size={18} color="var(--text-muted)" />
          </button>
        </div>
      </div>
    </>
  );
}
