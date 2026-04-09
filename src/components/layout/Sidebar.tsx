import { GitBranch, Plug, Sparkles, Search, Shield, FileText, Activity, Terminal, Settings, Layers } from "lucide-react";
import { useUIStore, type ModalName } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";

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

const nodeTypes = [
  { type: "service", label: "Svc", color: "#3b4199" },
  { type: "database", label: "DB", color: "#065f46" },
  { type: "cache", label: "Ca", color: "#047857" },
  { type: "external", label: "Ext", color: "#374151" },
];

const layouts: { value: "force" | "hierarchical"; icon: string }[] = [
  { value: "force", icon: "F" },
  { value: "hierarchical", icon: "H" },
];

export function Sidebar() {
  const { openModal } = useUIStore();
  const { filters, toggleTypeFilter, layout, setLayout } = useGraphStore();

  return (
    <div
      className="flex flex-col items-center py-2.5 gap-0.5 shrink-0"
      style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-center mb-2"
        style={{
          width: 30, height: 30, borderRadius: "var(--radius-md)",
          background: "var(--accent-soft)",
          border: "1px solid var(--accent-medium)",
        }}
      >
        <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 800 }}>S</span>
      </div>

      {/* Nav items */}
      {menuItems.map((item) => (
        <button
          key={item.label}
          title={item.label}
          onClick={() => item.modal !== "navigate" && openModal(item.modal)}
          className="flex items-center justify-center transition-all duration-100"
          style={{
            width: 34, height: 34, borderRadius: "var(--radius-md)",
            background: item.active ? "var(--accent-soft)" : "transparent",
            border: item.active ? "1px solid var(--accent-medium)" : "1px solid transparent",
          }}
        >
          <item.icon
            size={15}
            color={item.active ? "var(--accent-text)" : "var(--text-muted)"}
            strokeWidth={item.active ? 2 : 1.5}
          />
        </button>
      ))}

      {/* Separator */}
      <div className="w-5 my-1" style={{ borderTop: "1px solid var(--border)" }} />

      {/* Node type filters (from dissolved FilterPanel) */}
      <div className="flex flex-col items-center gap-0.5">
        {nodeTypes.map((nt) => {
          const active = filters.types.has(nt.type);
          return (
            <button
              key={nt.type}
              title={`Toggle ${nt.type}`}
              onClick={() => toggleTypeFilter(nt.type)}
              className="flex items-center justify-center transition-all duration-100"
              style={{
                width: 28, height: 20, borderRadius: "var(--radius-sm)",
                background: active ? "transparent" : "transparent",
                border: `1.5px solid ${active ? nt.color : "var(--border)"}`,
                opacity: active ? 1 : 0.3,
              }}
            >
              <span style={{ fontSize: 8, color: active ? nt.color : "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                {nt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Layout switcher */}
      <div className="flex flex-col items-center gap-0.5 mt-1">
        {layouts.map((l) => (
          <button
            key={l.value}
            title={l.value}
            onClick={() => setLayout(l.value)}
            className="flex items-center justify-center transition-all duration-100"
            style={{
              width: 22, height: 18, borderRadius: "var(--radius-sm)",
              background: layout === l.value ? "var(--accent-soft)" : "transparent",
              border: layout === l.value ? "1px solid var(--accent-medium)" : "1px solid transparent",
            }}
          >
            <span style={{ fontSize: 8, color: layout === l.value ? "var(--accent-text)" : "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
              {l.icon}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Settings */}
      <button
        title="Settings"
        onClick={() => openModal("settings")}
        className="flex items-center justify-center transition-colors"
        style={{ width: 34, height: 34, borderRadius: "var(--radius-md)" }}
      >
        <Settings size={15} color="var(--text-muted)" strokeWidth={1.5} />
      </button>
      {/* Avatar */}
      <button
        title="Account"
        onClick={() => openModal("user")}
        className="flex items-center justify-center mt-0.5"
        style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--accent-soft)",
          border: "1px solid var(--accent-medium)",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--accent-text)", fontWeight: 600 }}>U</span>
      </button>
    </div>
  );
}
