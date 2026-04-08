import { useGraphStore } from "@/stores/graph";

const nodeTypes = [
  { type: "service", label: "Service", bg: "#3b4199", border: "#6366f1" },
  { type: "database", label: "Database", bg: "#065f46", border: "#10b981" },
  { type: "cache", label: "Cache", bg: "#065f46", border: "#047857" },
  { type: "external", label: "External", bg: "#374151", border: "#6b7280" },
];

const layouts = [
  { value: "cose" as const, label: "Force" },
  { value: "dagre" as const, label: "Hierarchical" },
  { value: "circle" as const, label: "Circular" },
];

export function FilterPanel() {
  const { filters, toggleTypeFilter, layout, setLayout } = useGraphStore();

  return (
    <div
      className="overflow-y-auto p-3"
      style={{
        width: 200,
        borderRight: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.2)",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest mb-2.5"
        style={{ color: "#4a4a60" }}
      >
        Node Types
      </div>
      <div className="flex flex-col gap-1.5">
        {nodeTypes.map((nt) => (
          <label
            key={nt.type}
            className="flex items-center gap-2 text-[11px] cursor-pointer"
            style={{ color: "#8888a0" }}
          >
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{
                background: filters.types.has(nt.type) ? nt.bg : "transparent",
                border: `1px solid ${nt.border}`,
                opacity: filters.types.has(nt.type) ? 1 : 0.3,
              }}
              onClick={() => toggleTypeFilter(nt.type)}
            />
            {nt.label}
          </label>
        ))}
      </div>

      <div
        className="text-[10px] uppercase tracking-widest mt-4 mb-2.5"
        style={{ color: "#4a4a60" }}
      >
        Layout
      </div>
      <div className="flex gap-1">
        {layouts.map((l) => (
          <button
            key={l.value}
            onClick={() => setLayout(l.value)}
            className="text-[10px] px-2 py-1 rounded transition-colors"
            style={{
              background:
                layout === l.value ? "rgba(99,102,241,0.12)" : "transparent",
              border:
                layout === l.value
                  ? "1px solid rgba(99,102,241,0.2)"
                  : "1px solid rgba(255,255,255,0.06)",
              color: layout === l.value ? "#a5b4fc" : "#4a4a60",
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
