import { useGraphStore } from "@/stores/graph";

export function ViolationBadge() {
  const count = useGraphStore((s) => s.stats.violationCount);
  if (count === 0) return null;
  return (
    <div
      className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono violation-pulse"
      style={{
        background: "rgba(239,68,68,0.1)",
        border: "1px solid rgba(239,68,68,0.4)",
        color: "#fca5a5",
      }}
    >
      {count} violation{count === 1 ? "" : "s"} detected
    </div>
  );
}
