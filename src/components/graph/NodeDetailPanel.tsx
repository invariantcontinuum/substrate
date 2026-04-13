import { useGraphStore } from "@/stores/graph";
import { X } from "lucide-react";

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  service:  { bg: "#0f0f1f", border: "#818cf8", text: "#c7d2fe" },
  source:   { bg: "#0a1a1e", border: "#22d3ee", text: "#a5f3fc" },
  config:   { bg: "#1a1400", border: "#fbbf24", text: "#fde68a" },
  script:   { bg: "#0a1a14", border: "#34d399", text: "#6ee7b7" },
  doc:      { bg: "#0f1118", border: "#64748b", text: "#94a3b8" },
  data:     { bg: "#0a1520", border: "#38bdf8", text: "#7dd3fc" },
  asset:    { bg: "#0d1117", border: "#475569", text: "#94a3b8" },
  database: { bg: "#0a1a14", border: "#065f46", text: "#6ee7b7" },
  cache:    { bg: "#0a1a14", border: "#047857", text: "#6ee7b7" },
  external: { bg: "#0d1117", border: "#374151", text: "#9ca3af" },
  policy:   { bg: "#150a2a", border: "#7c3aed", text: "#d8b4fe" },
  adr:      { bg: "#1a1400", border: "#92400e", text: "#fcd34d" },
  incident: { bg: "#1a0505", border: "#991b1b", text: "#fca5a5" },
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2.5">
      <span className="text-[9px] uppercase tracking-wider font-semibold shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="text-[11px] text-right truncate"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function NodeDetailPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedNodeData = useGraphStore((s) => s.selectedNodeData);
  const selectNode = useGraphStore((s) => s.selectNode);

  const data = selectedNodeData;
  const nodeType = String(data?.type || "service");
  const colors = TYPE_COLORS[nodeType] || TYPE_COLORS.service;

  if (!selectedNodeId || !data) return null;

  return (
    <div
      className="shrink-0 flex flex-col overflow-hidden"
      style={{
        width: 340,
        height: "100%",
        background: "var(--bg-surface)",
        backdropFilter: "blur(var(--overlay-blur))",
        borderLeft: "1px solid var(--border)",
        animation: "slideInRight 0.2s ease-out both",
      }}
    >
      {/* Header with type color */}
      <div
        className="px-5 py-4 flex items-center justify-between shrink-0"
        style={{
          background: colors.bg,
          borderBottom: `1px solid ${colors.border}44`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-3.5 h-3.5 rounded-md shrink-0"
            style={{ background: colors.border, boxShadow: `0 0 8px ${colors.border}44` }}
          />
          <div className="min-w-0">
            <div
              className="text-[13px] font-bold truncate"
              style={{ color: colors.text, fontFamily: "var(--font-display)" }}
              title={String(data.label || data.name || data.id)}
            >
              {String(data.label || data.name || data.id)}
            </div>
            <div
              className="text-[9px] mt-0.5 truncate font-medium"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              title={nodeType}
            >
              {nodeType}
            </div>
          </div>
        </div>
        <button
          onClick={() => selectNode(null)}
          className="flex items-center justify-center w-7 h-7 shrink-0"
          style={{ borderRadius: "var(--radius-sm)", background: "var(--bg-hover)", border: "1px solid var(--border)" }}
        >
          <X size={14} color="var(--text-muted)" />
        </button>
      </div>

      {/* Scrollable body */}
      <div
        className="flex-1 overflow-y-auto px-5 py-5"
        style={{ overscrollBehavior: "contain" }}
      >
        <span
          className="text-[9px] uppercase tracking-[0.15em] font-semibold block mb-3"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
        >
          Properties
        </span>
        <div
          className="p-4"
          style={{
            background: "var(--bg-hover)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {Object.entries(data).map(([key, value]) => {
            if (key === "id") return null;
            if (typeof value === "object" && value !== null) return null;
            return (
              <DetailRow key={key} label={key} value={String(value ?? "\u2014")} />
            );
          })}
        </div>

        {/* ID */}
        <span
          className="text-[9px] uppercase tracking-[0.15em] font-semibold block mt-5 mb-3"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
        >
          ID
        </span>
        <div
          className="px-4 py-3 text-[10px] break-all"
          style={{
            background: "var(--bg-hover)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)", color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {String(data.id)}
        </div>

        {/* Meta section */}
        {(() => {
          const meta = data.meta;
          if (!meta || typeof meta !== "object") return null;
          const entries = Object.entries(meta as Record<string, unknown>);
          if (entries.length === 0) return null;
          return (
            <>
              <span
                className="text-[9px] uppercase tracking-[0.15em] font-semibold block mt-5 mb-3"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
              >
                Metadata
              </span>
              <div
                className="p-4"
                style={{
                  background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                {entries.map(([key, value]) => (
                  <DetailRow key={key} label={key} value={String(value ?? "\u2014")} />
                ))}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
