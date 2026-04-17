import { useMemo } from "react";
import { useGraphStore } from "@/stores/graph";

// Dot colors mirror the cytoscape border colors per node type, so
// the legend and canvas read as a single system. Kept muted enough to
// pair with the dark canvas without shouting.
const typePalette: Record<string, string> = {
  service: "#6f8ab7",
  database: "#6b9a70",
  cache: "#5a9578",
  policy: "#9d7bcc",
  adr: "#a66a1f",
  incident: "#c53030",
  external: "#615d6c",
  source: "#6f8ab7",
  config: "#615d6c",
  script: "#a66a1f",
  doc: "#615d6c",
  data: "#6b9a70",
  asset: "#615d6c",
  default: "rgba(202,229,255,0.18)",
};

export function DynamicLegend() {
  const nodes = useGraphStore((s) => s.nodes);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const isolateTypeFilter = useGraphStore((s) => s.isolateTypeFilter);

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

  // Every distinct type observed in the current graph — used to
  // restore "all visible" when the user clicks the currently-isolated
  // type a second time. Must sit before any conditional return so the
  // hook count stays stable between renders (React error #310).
  const allTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const n of nodes) seen.add(String(n.type || "unknown"));
    return Array.from(seen);
  }, [nodes]);

  if (types.length <= 1) return null;

  const isolated =
    visibleTypes.size === 1 ? Array.from(visibleTypes)[0] : null;

  return (
    <div className="dynamic-legend">
      {types.map(([t, count]) => {
        const active = visibleTypes.has(t);
        const isSoleActive = isolated === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => isolateTypeFilter(t, allTypes)}
            className={`dynamic-legend-item${active ? "" : " is-inactive"}${isSoleActive ? " is-isolated" : ""}`}
            title={
              isSoleActive
                ? `Click to show all types`
                : `Show only ${t}`
            }
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
