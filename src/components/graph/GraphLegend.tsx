const nodeItems = [
  { label: "Service",  color: "#3b4199" },
  { label: "Database", color: "#065f46" },
  { label: "Policy",   color: "#7c3aed" },
];

const edgeItems = [
  { label: "why edge",  color: "#f59e0b", style: "dashed" as const },
  { label: "violation", color: "#ef4444", style: "dashed" as const },
];

export function GraphLegend() {
  return (
    <div
      className="absolute bottom-3 right-3 flex flex-col gap-1.5 p-3 rounded-lg z-10"
      style={{
        background: "rgba(6,6,8,0.85)",
        border: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)",
      }}
    >
      <span
        className="text-[9px] uppercase tracking-[0.15em] mb-0.5 font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        Legend
      </span>
      {nodeItems.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-[10px]">
          <div
            className="w-[10px] h-[10px] rounded-sm"
            style={{
              background: item.color,
              opacity: 0.9,
            }}
          />
          <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
        </div>
      ))}
      <div className="mt-0.5 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {edgeItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-[10px]">
            <div className="w-[10px] flex items-center">
              <div
                className="w-full h-0"
                style={{ borderTop: `1.5px ${item.style} ${item.color}` }}
              />
            </div>
            <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
