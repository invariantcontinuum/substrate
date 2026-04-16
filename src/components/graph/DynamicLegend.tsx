import { useMemo } from "react";
import { useGraphStore } from "@/stores/graph";

const typePalette: Record<string, string> = {
  service: "#3b4199",
  database: "#065f46",
  cache: "#047857",
  policy: "#7c3aed",
  adr: "#92400e",
  incident: "#991b1b",
  external: "#374151",
  source: "#3b4199",
  config: "#374151",
  script: "#92400e",
  doc: "#374151",
  data: "#065f46",
  asset: "#374151",
  default: "rgba(255,255,255,0.12)",
};

export function DynamicLegend() {
  const nodes = useGraphStore((s) => s.nodes);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const toggleTypeFilter = useGraphStore((s) => s.toggleTypeFilter);

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) {
      const t = String(n.type || "unknown");
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [nodes]);

  if (types.length <= 1) return null;

  return (
    <div className="dynamic-legend">
      {types.map(([t, count]) => {
        const active = visibleTypes.has(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggleTypeFilter(t)}
            className={`dynamic-legend-item${active ? "" : " is-inactive"}`}
            title={active ? `Hide ${t}` : `Show ${t}`}
          >
            <span
              className="dynamic-legend-dot"
              style={{ background: active ? (typePalette[t] || typePalette.default) : "transparent" }}
            />
            <span className="dynamic-legend-label">{t}</span>
            <span className="dynamic-legend-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
