import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGraphStore } from "@/stores/graph";

interface StatusItem {
  id: string;
  color: string;
  message: string;
}

export function StatusCarousel() {
  const { connectionStatus, stats } = useGraphStore();
  const [items, setItems] = useState<StatusItem[]>([
    { id: "init", color: "var(--accent)", message: "Substrate initialized" },
  ]);

  useEffect(() => {
    const color =
      connectionStatus === "connected" ? "var(--success)"
      : connectionStatus === "reconnecting" ? "var(--warning)"
      : "var(--error)";
    const message =
      connectionStatus === "connected" ? "Live feed active"
      : connectionStatus === "reconnecting" ? "Reconnecting..."
      : "Disconnected";
    setItems((prev) => [{ id: `conn-${Date.now()}`, color, message }, ...prev].slice(0, 6));
  }, [connectionStatus]);

  useEffect(() => {
    if (stats.nodeCount > 0) {
      setItems((prev) => [
        { id: `stats-${Date.now()}`, color: "var(--purple)", message: `${stats.nodeCount} nodes, ${stats.edgeCount} edges` },
        ...prev,
      ].slice(0, 6));
    }
  }, [stats.nodeCount, stats.edgeCount]);

  return (
    <div
      className="absolute bottom-4 left-4 flex flex-col gap-1 py-3 px-3.5 rounded-xl z-10"
      style={{
        background: "radial-gradient(ellipse at center, var(--overlay-panel) 0%, transparent 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        maxWidth: 280,
      }}
    >
      <span className="text-[9px] uppercase tracking-[0.15em] mb-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
        Activity
      </span>
      <AnimatePresence initial={false}>
        {items.slice(0, 4).map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex items-start gap-2 text-[10px] leading-relaxed"
          >
            <div
              className="w-[5px] h-[5px] rounded-full mt-[5px] shrink-0"
              style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }}
            />
            <span style={{ color: "var(--text-secondary)" }}>{item.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
