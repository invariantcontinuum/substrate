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
    <div>
      <span>{label}</span>
      <span title={value}>{value}</span>
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
    <div className="shrink-0 flex flex-col overflow-hidden w-80 h-full bg-[#0c0c12] border-l border-white/10 text-gray-200">
      <div style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}44` }}>
        <div>
          <div style={{ background: colors.border }} />
          <div>
            <div style={{ color: colors.text }} title={String(data.label || data.name || data.id)}>
              {String(data.label || data.name || data.id)}
            </div>
            <div title={nodeType}>{nodeType}</div>
          </div>
        </div>
        <button onClick={() => selectNode(null)}>
          <X size={14} />
        </button>
      </div>

      <div>
        <span>Properties</span>
        <div>
          {Object.entries(data).map(([key, value]) => {
            if (key === "id") return null;
            if (typeof value === "object" && value !== null) return null;
            return <DetailRow key={key} label={key} value={String(value ?? "—")} />;
          })}
        </div>

        <span>ID</span>
        <div>{String(data.id)}</div>

        {(() => {
          const meta = data.meta;
          if (!meta || typeof meta !== "object") return null;
          const entries = Object.entries(meta as Record<string, unknown>);
          if (entries.length === 0) return null;
          return (
            <>
              <span>Metadata</span>
              <div>
                {entries.map(([key, value]) => (
                  <DetailRow key={key} label={key} value={String(value ?? "—")} />
                ))}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
