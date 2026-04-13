import { useGraphStore } from "@/stores/graph";

const TYPE_COLORS: Record<string, string> = {
  source: "#22d3ee",
  config: "#fbbf24",
  script: "#34d399",
  doc: "#64748b",
  data: "#38bdf8",
  asset: "#475569",
  service: "#3b4199",
  database: "#065f46",
  cache: "#047857",
  policy: "#7c3aed",
  adr: "#92400e",
  incident: "#991b1b",
  external: "#374151",
};

export function DynamicLegend() {
  const nodeCount = useGraphStore((s) => s.stats.nodeCount);
  if (nodeCount === 0) return null;

  return (
    <div className="absolute bottom-3 right-3 hidden sm:flex flex-col border border-black bg-white p-2 text-black z-10">
      {Object.entries(TYPE_COLORS).map(([type]) => (
        <div key={type} className="flex items-center gap-1.5">
          <div className="w-2 h-2 border border-black bg-black" />
          {type}
        </div>
      ))}
    </div>
  );
}
