import { useMemo } from "react";
import { useGraphStore } from "@/stores/graph";
import { useThemeStore } from "@/stores/theme";

// Dot colors mirror the cytoscape border colors per node type (see
// buildCyStylesheet in GraphCanvas.tsx) so the legend and canvas read
// as a single system. Two palettes because the canvas uses deeper
// hues on linen (for contrast) and brighter hues on shadow-grey.
const DARK_TYPE_PALETTE: Record<string, string> = {
  service:   "#6fb5a7",
  source:    "#6fb5a7",
  database:  "#d88a73",
  cache:     "#e8aa99",
  data:      "#d88a73",
  policy:    "#f3dfa2",
  adr:       "#e6c866",
  incident:  "#e6706b",
  external:  "#a19890",
  config:    "#c5b8a8",
  script:    "#e6c866",
  doc:       "#d88a73",
  asset:     "#a19890",
  default:   "rgba(239,230,221,0.28)",
};

const LIGHT_TYPE_PALETTE: Record<string, string> = {
  service:   "#1c554e",
  source:    "#1c554e",
  database:  "#a64a35",
  cache:     "#7a3728",
  data:      "#a64a35",
  policy:    "#c59e3a",
  adr:       "#b8882a",
  incident:  "#a43b3b",
  external:  "#6b6866",
  config:    "#8a7f74",
  script:    "#b8882a",
  doc:       "#7a3728",
  asset:     "#6b6866",
  default:   "rgba(35,31,32,0.22)",
};

export function DynamicLegend() {
  const nodes = useGraphStore((s) => s.nodes);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const isolateTypeFilter = useGraphStore((s) => s.isolateTypeFilter);
  const theme = useThemeStore((s) => s.theme);

  const typePalette = theme === "light" ? LIGHT_TYPE_PALETTE : DARK_TYPE_PALETTE;

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
