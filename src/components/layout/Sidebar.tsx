import { GitBranch, Plug, Sparkles, Search, Shield, FileText, Activity, Terminal, Settings } from "lucide-react";
import { useUIStore, type ModalName } from "@/stores/ui";

const menuItems: { icon: typeof GitBranch; label: string; modal: ModalName | "navigate"; active?: boolean }[] = [
  { icon: GitBranch, label: "Graph", modal: "navigate", active: true },
  { icon: Plug, label: "Sources", modal: "sources" },
  { icon: Sparkles, label: "Enrichment", modal: "enrichment" },
  { icon: Search, label: "Search", modal: "search" },
  { icon: Shield, label: "Policies", modal: "policies" },
  { icon: FileText, label: "ADRs", modal: "adrs" },
  { icon: Activity, label: "Drift", modal: "drift" },
  { icon: Terminal, label: "Query", modal: "query" },
];

export function Sidebar() {
  const { openModal } = useUIStore();

  return (
    <div
      className="flex flex-col items-center py-3 gap-1 shrink-0"
      style={{
        width: 56,
        minWidth: 56,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-center mb-3"
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: "rgba(99,102,241,0.12)",
          border: "1px solid rgba(99,102,241,0.25)",
        }}
      >
        <span style={{ color: "#6366f1", fontSize: 14, fontWeight: 800 }}>S</span>
      </div>

      {/* Menu items */}
      {menuItems.map((item) => (
        <button
          key={item.label}
          title={item.label}
          onClick={() => item.modal !== "navigate" && openModal(item.modal)}
          className="flex items-center justify-center transition-all duration-150"
          style={{
            width: 36, height: 36, borderRadius: 8,
            background: item.active ? "rgba(99,102,241,0.1)" : "transparent",
            border: item.active ? "1px solid rgba(99,102,241,0.18)" : "1px solid transparent",
          }}
        >
          <item.icon
            size={16}
            color={item.active ? "#a5b4fc" : "var(--text-muted)"}
            strokeWidth={item.active ? 2 : 1.5}
          />
        </button>
      ))}

      <div className="flex-1" />

      {/* Footer: user + settings */}
      <button
        title="Settings"
        onClick={() => openModal("settings")}
        className="flex items-center justify-center"
        style={{ width: 36, height: 36, borderRadius: 8 }}
      >
        <Settings size={16} color="var(--text-muted)" strokeWidth={1.5} />
      </button>
      <button
        title="Account"
        onClick={() => openModal("user")}
        className="flex items-center justify-center mt-1"
        style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "rgba(99,102,241,0.2)",
          border: "1px solid rgba(99,102,241,0.3)",
        }}
      >
        <span style={{ fontSize: 11, color: "#a5b4fc", fontWeight: 600 }}>U</span>
      </button>
    </div>
  );
}
