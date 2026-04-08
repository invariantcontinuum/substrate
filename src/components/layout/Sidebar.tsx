import { GitBranch, Shield, FileText, Activity, Search, Plug, Settings } from "lucide-react";

const navItems = [
  { icon: GitBranch, label: "Graph", path: "/graph", active: true },
  { icon: Shield, label: "Policies", path: "/policies", disabled: true },
  { icon: FileText, label: "ADRs", path: "/adr", disabled: true },
  { icon: Activity, label: "Drift", path: "/drift", disabled: true },
  { icon: Search, label: "Query", path: "/query", disabled: true },
];

const bottomItems = [
  { icon: Plug, label: "Connectors", path: "/connectors", disabled: true },
  { icon: Settings, label: "Settings", path: "/settings", disabled: true },
];

export function Sidebar() {
  return (
    <div
      className="flex flex-col items-center py-3 gap-1"
      style={{
        width: 48,
        minWidth: 48,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div
        className="flex items-center justify-center mb-2"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: "rgba(99,102,241,0.12)",
          border: "1px solid rgba(99,102,241,0.25)",
        }}
      >
        <span style={{ color: "#6366f1", fontSize: 12, fontWeight: 800, letterSpacing: "-0.02em" }}>S</span>
      </div>

      {navItems.map((item) => (
        <button
          key={item.label}
          title={item.label}
          disabled={item.disabled}
          className="flex items-center justify-center transition-all duration-150"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: item.active ? "rgba(99,102,241,0.1)" : "transparent",
            border: item.active ? "1px solid rgba(99,102,241,0.18)" : "1px solid transparent",
            opacity: item.disabled ? 0.25 : 1,
            cursor: item.disabled ? "default" : "pointer",
          }}
        >
          <item.icon size={15} color={item.active ? "#a5b4fc" : "var(--text-muted)"} strokeWidth={item.active ? 2 : 1.5} />
        </button>
      ))}

      <div className="flex-1" />

      {bottomItems.map((item) => (
        <button
          key={item.label}
          title={item.label}
          disabled
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            opacity: 0.25,
          }}
        >
          <item.icon size={15} color="var(--text-muted)" strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
