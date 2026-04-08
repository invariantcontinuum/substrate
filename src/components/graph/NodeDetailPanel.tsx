import { useGraphStore } from "@/stores/graph";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  service: { bg: "#0f0f1f", border: "#3b4199", text: "#c7d2fe" },
  database: { bg: "#0a1a14", border: "#065f46", text: "#6ee7b7" },
  cache: { bg: "#0a1a14", border: "#047857", text: "#6ee7b7" },
  external: { bg: "#0d1117", border: "#374151", text: "#9ca3af" },
  policy: { bg: "#150a2a", border: "#7c3aed", text: "#d8b4fe" },
  adr: { bg: "#1a1400", border: "#92400e", text: "#fcd34d" },
  incident: { bg: "#1a0505", border: "#991b1b", text: "#fca5a5" },
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3 py-1.5">
      <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="text-[11px] text-right truncate"
        style={{ color: "var(--text-secondary)", fontFamily: "'JetBrains Mono', monospace" }}
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

  return (
    <AnimatePresence>
      {selectedNodeId && data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => selectNode(null)}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="rounded-xl overflow-hidden"
            style={{
              width: 380,
              maxHeight: "80vh",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with type color */}
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{
                background: colors.bg,
                borderBottom: `1px solid ${colors.border}44`,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ background: colors.border }}
                />
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-semibold truncate"
                    style={{ color: colors.text }}
                    title={String(data.label || data.name || data.id)}
                  >
                    {String(data.label || data.name || data.id)}
                  </div>
                  <div
                    className="text-[10px] mt-0.5 truncate"
                    style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
                    title={String(data.id)}
                  >
                    {String(data.id)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => selectNode(null)}
                className="flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0"
                style={{ color: "var(--text-muted)", background: "rgba(255,255,255,0.05)" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Properties */}
            <div className="px-5 py-4">
              <span
                className="text-[9px] uppercase tracking-[0.15em] font-medium block mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Properties
              </span>
              <div
                className="rounded-lg p-3"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  {Object.entries(data).map(([key, value]) => {
                    if (key === "id") return null;
                    if (typeof value === "object" && value !== null) return null;
                    return (
                      <DetailRow
                        key={key}
                        label={key}
                        value={String(value ?? "\u2014")}
                      />
                    );
                  })}
                </div>
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
                      className="text-[9px] uppercase tracking-[0.15em] font-medium block mt-4 mb-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Metadata
                    </span>
                    <div
                      className="rounded-lg p-3"
                      style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                        {entries.map(([key, value]) => (
                          <DetailRow
                            key={key}
                            label={key}
                            value={String(value ?? "\u2014")}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
