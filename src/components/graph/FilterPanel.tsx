import { useGraphStore } from "@/stores/graph";

const nodeTypes = [
  { type: "service", label: "Service", bg: "#3b4199", border: "#6366f1" },
  { type: "database", label: "Database", bg: "#065f46", border: "#10b981" },
  { type: "cache", label: "Cache", bg: "#92400e", border: "#f59e0b" },
  { type: "external", label: "External", bg: "#374151", border: "#6b7280" },
];

const layouts = [
  { value: "force" as const, label: "Force" },
  { value: "hierarchical" as const, label: "Hierarchical" },
];

export function FilterPanel() {
  const { filters, toggleTypeFilter, layout, setLayout, stats } = useGraphStore();

  return (
    <div
      className="overflow-y-auto p-2.5 shrink-0"
      style={{
        width: 180,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-surface)",
        animation: "slideInLeft 0.3s ease-out 0.15s both",
      }}
    >
      <div className="text-[9px] uppercase tracking-[0.15em] mb-2 font-medium" style={{ color: "var(--text-muted)" }}>
        Node Types
      </div>
      <div className="flex flex-col gap-1">
        {nodeTypes.map((nt) => {
          const active = filters.types.has(nt.type);
          return (
            <button key={nt.type} onClick={() => toggleTypeFilter(nt.type)}
              className="flex items-center gap-2 text-[10px] py-1 px-1.5 rounded transition-all duration-150 text-left"
              style={{ background: active ? "rgba(255,255,255,0.03)" : "transparent", color: active ? "var(--text-secondary)" : "var(--text-muted)" }}>
              <div className="w-2.5 h-2.5 rounded-sm shrink-0 transition-all duration-150"
                style={{ background: active ? nt.bg : "transparent", border: `1.5px solid ${nt.border}`, opacity: active ? 1 : 0.3 }} />
              <span className="flex-1">{nt.label}</span>
            </button>
          );
        })}
      </div>

      <div className="text-[9px] uppercase tracking-[0.15em] mt-4 mb-2 font-medium" style={{ color: "var(--text-muted)" }}>Layout</div>
      <div className="flex flex-col gap-0.5">
        {layouts.map((l) => (
          <button key={l.value} onClick={() => setLayout(l.value)}
            className="text-[10px] px-2 py-1.5 rounded transition-all duration-150 text-left"
            style={{ background: layout === l.value ? "rgba(99,102,241,0.1)" : "transparent",
              border: layout === l.value ? "1px solid rgba(99,102,241,0.18)" : "1px solid transparent",
              color: layout === l.value ? "#a5b4fc" : "var(--text-muted)" }}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="text-[9px] uppercase tracking-[0.15em] mb-2 font-medium" style={{ color: "var(--text-muted)" }}>Graph</div>
        <div className="flex flex-col gap-1 text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-muted)" }}>Nodes</span>
            <span style={{ color: "#a5b4fc" }}>{stats.nodeCount}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--text-muted)" }}>Edges</span>
            <span style={{ color: "#a5b4fc" }}>{stats.edgeCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
