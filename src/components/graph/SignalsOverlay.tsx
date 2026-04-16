import { motion, AnimatePresence } from "framer-motion";
import { useGraphStore } from "@/stores/graph";

const typeColor: Record<string, string> = {
  commit: "#10b981",
  policy: "#6366f1",
  violation: "#ef4444",
  drift: "#f59e0b",
  sync: "#10b981",
  default: "#8888a0",
};

export function SignalsOverlay() {
  const signals = useGraphStore((s) => s.signals);
  if (!signals.length) return null;

  const last = signals.slice(-5);

  return (
    <div className="signals-overlay">
      <AnimatePresence initial={false}>
        {last.map((s, i) => (
          <motion.div
            key={`${s.nodeId}-${s.timestamp}-${i}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1 - i * 0.18, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="signals-overlay-row"
          >
            <span
              className="signals-overlay-dot"
              style={{ color: typeColor[s.type] || typeColor.default }}
            >
              &#x25CF;
            </span>
            <span className="signals-overlay-label">{s.type}</span>
            <span className="signals-overlay-node">{s.nodeId.slice(0, 20)}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
