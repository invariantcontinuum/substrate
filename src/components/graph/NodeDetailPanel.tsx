import { useGraphStore } from "@/stores/graph";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "react-oidc-context";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  service: { bg: "#0f0f1f", border: "#3b4199", text: "#c7d2fe" },
  database: { bg: "#0a1a14", border: "#065f46", text: "#6ee7b7" },
  cache: { bg: "#1a1400", border: "#92400e", text: "#fbbf24" },
  external: { bg: "#0d1117", border: "#374151", text: "#9ca3af" },
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-1">
      <span className="text-[9px] uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span
        className="text-[10px] text-right truncate"
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
  const selectNode = useGraphStore((s) => s.selectNode);
  const auth = useAuth();
  const token = auth.user?.access_token;

  const { data } = useQuery({
    queryKey: ["node", selectedNodeId],
    queryFn: () =>
      apiFetch<Record<string, unknown>>(
        `/api/graph/nodes/${selectedNodeId}`,
        token
      ),
    enabled: !!selectedNodeId && !!token,
  });

  return (
    <AnimatePresence>
      {selectedNodeId && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden shrink-0"
          style={{
            borderLeft: "1px solid var(--border)",
            background: "var(--bg-surface)",
          }}
        >
          <div className="p-3 w-[260px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span
                className="text-[9px] uppercase tracking-[0.15em] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Node Detail
              </span>
              <button
                onClick={() => selectNode(null)}
                className="flex items-center justify-center w-5 h-5 rounded transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={12} />
              </button>
            </div>

            {/* Node identity card */}
            <div
              className="rounded-md p-2.5 mb-3"
              style={{
                background: TYPE_COLORS[selectedNodeId ? "service" : "service"].bg,
                border: `1px solid ${TYPE_COLORS["service"].border}33`,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{
                    background: TYPE_COLORS["service"].bg,
                    border: `1.5px solid ${TYPE_COLORS["service"].border}`,
                  }}
                />
                <span
                  className="text-[12px] font-semibold truncate"
                  style={{ color: TYPE_COLORS["service"].text }}
                  title={selectedNodeId}
                >
                  {selectedNodeId.split("/").pop()}
                </span>
              </div>
              <span
                className="text-[9px] block truncate"
                style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
                title={selectedNodeId}
              >
                {selectedNodeId}
              </span>
            </div>

            {/* Metadata */}
            {data && (
              <div
                className="rounded-md p-2.5"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span
                  className="text-[9px] uppercase tracking-[0.15em] font-medium block mb-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Properties
                </span>
                <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  {Object.entries(data).map(([key, value]) => {
                    if (typeof value === "object" && value !== null) return null;
                    return (
                      <DetailRow
                        key={key}
                        label={key}
                        value={String(value ?? "—")}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
