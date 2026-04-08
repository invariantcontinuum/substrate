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
      className="flex flex-col items-center py-4 gap-2"
      style={{
        width: 56,
        minWidth: 56,
        background: "#0a0a10",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-center mb-3"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "rgba(99,102,241,0.15)",
          border: "1px solid rgba(99,102,241,0.3)",
        }}
      >
        <span style={{ color: "#6366f1", fontSize: 14, fontWeight: 700 }}>S</span>
      </div>

      {/* Nav items */}
      {navItems.map((item) => (
        <button
          key={item.label}
          title={item.label}
          disabled={item.disabled}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: item.active ? "rgba(99,102,241,0.12)" : "transparent",
            border: item.active ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent",
            opacity: item.disabled ? 0.3 : 1,
            cursor: item.disabled ? "default" : "pointer",
          }}
        >
          <item.icon size={16} color={item.active ? "#a5b4fc" : "#4a4a60"} />
        </button>
      ))}

      <div className="flex-1" />

      {/* Bottom items */}
      {bottomItems.map((item) => (
        <button
          key={item.label}
          title={item.label}
          disabled={item.disabled}
          className="flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            opacity: 0.5,
            cursor: "default",
          }}
        >
          <item.icon size={16} color="#4a4a60" />
        </button>
      ))}
    </div>
  );
}
