const items = [
  { label: "Service", bg: "#0f0f1f", border: "#3b4199" },
  { label: "Database", bg: "#0a1a14", border: "#065f46" },
  { label: "Cache", bg: "#0a1a14", border: "#047857" },
  { label: "External", bg: "#0d1117", border: "#374151" },
];

export function GraphLegend() {
  return (
    <div
      className="absolute bottom-3 right-3 flex flex-col gap-1 p-2.5 rounded-lg"
      style={{
        background: "rgba(13,13,18,0.9)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span
        className="text-[9px] uppercase tracking-widest mb-0.5"
        style={{ color: "#4a4a60" }}
      >
        Legend
      </span>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-[10px]">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ background: item.bg, border: `1px solid ${item.border}` }}
          />
          <span style={{ color: "#8888a0" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
