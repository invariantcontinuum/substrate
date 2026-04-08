const items = [
  { label: "Service", shape: "rounded", bg: "#0f0f1f", border: "#3b4199" },
  { label: "Database", shape: "barrel", bg: "#0a1a14", border: "#065f46" },
  { label: "Cache", shape: "barrel", bg: "#1a1400", border: "#92400e" },
  { label: "External", shape: "rounded", bg: "#0d1117", border: "#374151" },
  { label: "Violation", shape: "rounded", bg: "#1a0a0a", border: "#dc2626" },
];

const edgeItems = [
  { label: "dep edge", style: "solid", color: "rgba(99,102,241,0.4)" },
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
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-[10px]">
          <div
            className="w-[10px] h-[10px]"
            style={{
              background: item.bg,
              border: `1.5px solid ${item.border}`,
              borderRadius: item.shape === "barrel" ? "2px 2px 4px 4px" : "2px",
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
