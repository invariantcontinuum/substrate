import { useGraphStore } from "@/stores/graph";

export function ViolationBadge() {
  const count = useGraphStore((s) => s.stats.violationCount);
  if (count === 0) return null;
  return (
    <div className="absolute top-3 right-3 border border-black bg-white text-black px-2 py-1 z-10">
      {count} violation{count === 1 ? "" : "s"} detected
    </div>
  );
}
