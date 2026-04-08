import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGraphStore } from "@/stores/graph";

interface StatusItem {
  id: string;
  color: string;
  glow: string;
  message: string;
  timestamp: Date;
}

const STATUS_COLORS = {
  info: { color: "#6366f1", glow: "0 0 6px #6366f1" },
  success: { color: "#10b981", glow: "0 0 6px #10b981" },
  warning: { color: "#f59e0b", glow: "0 0 6px #f59e0b" },
  error: { color: "#ef4444", glow: "0 0 6px #ef4444" },
  sync: { color: "#a855f7", glow: "0 0 6px #a855f7" },
} as const;

export function StatusCarousel() {
  const { connectionStatus, stats } = useGraphStore();
  const [items, setItems] = useState<StatusItem[]>([
    {
      id: "init",
      color: STATUS_COLORS.info.color,
      glow: STATUS_COLORS.info.glow,
      message: "Substrate Platform initialized",
      timestamp: new Date(),
    },
  ]);

  useEffect(() => {
    const entry: StatusItem = {
      id: `conn-${Date.now()}`,
      color: connectionStatus === "connected"
        ? STATUS_COLORS.success.color
        : connectionStatus === "reconnecting"
        ? STATUS_COLORS.warning.color
        : STATUS_COLORS.error.color,
      glow: connectionStatus === "connected"
        ? STATUS_COLORS.success.glow
        : connectionStatus === "reconnecting"
        ? STATUS_COLORS.warning.glow
        : STATUS_COLORS.error.glow,
      message: connectionStatus === "connected"
        ? "WebSocket connected — live updates active"
        : connectionStatus === "reconnecting"
        ? "Reconnecting to live feed..."
        : "WebSocket disconnected",
      timestamp: new Date(),
    };
    setItems((prev) => [entry, ...prev].slice(0, 8));
  }, [connectionStatus]);

  useEffect(() => {
    if (stats.nodeCount > 0) {
      setItems((prev) => [
        {
          id: `stats-${Date.now()}`,
          color: STATUS_COLORS.sync.color,
          glow: STATUS_COLORS.sync.glow,
          message: `Graph snapshot: ${stats.nodeCount} nodes, ${stats.edgeCount} edges`,
          timestamp: new Date(),
        },
        ...prev,
      ].slice(0, 8));
    }
  }, [stats.nodeCount, stats.edgeCount]);

  return (
    <div
      className="absolute bottom-3 left-3 flex flex-col gap-1.5 p-3 rounded-lg max-w-72 z-10"
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
        Activity
      </span>
      <AnimatePresence initial={false}>
        {items.slice(0, 5).map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex items-start gap-2 text-[10px] leading-relaxed"
          >
            <div
              className="w-[6px] h-[6px] rounded-full mt-[4px] shrink-0"
              style={{
                background: item.color,
                boxShadow: item.glow,
              }}
            />
            <span style={{ color: "var(--text-secondary)" }}>{item.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
