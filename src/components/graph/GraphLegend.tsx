const nodeItems = [
  { label: "Service",  color: "#3b4199" },
  { label: "Database", color: "#065f46" },
  { label: "Policy",   color: "#7c3aed" },
];

const edgeItems = [
  { label: "why",       color: "#f59e0b", style: "dashed" as const },
  { label: "violation", color: "#ef4444", style: "dashed" as const },
];

export function GraphLegend() {
  return (
    <div
      className="absolute top-4 right-4 flex flex-col gap-1 py-2.5 px-3 rounded-xl z-10"
      style={{
        background: "radial-gradient(ellipse at center, var(--overlay-panel) 0%, transparent 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <span className="text-[9px] uppercase tracking-[0.12em] mb-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
        Legend
      </span>
      {nodeItems.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-[10px]">
          <div className="w-2 h-2 rounded-sm" style={{ background: item.color }} />
          <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
        </div>
      ))}
      <div className="mt-0.5 pt-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {edgeItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[10px]">
            <div className="w-2 flex items-center">
              <div className="w-full" style={{ borderTop: `1.5px ${item.style} ${item.color}` }} />
            </div>
            <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
