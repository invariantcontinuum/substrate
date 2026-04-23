import { useMemo } from "react";
import { useGraphStore } from "@/stores/graph";
import { useThemeStore } from "@/stores/theme";
import { buildGraphTheme } from "@invariantcontinuum/graph/react";

export function DynamicLegend() {
  const nodes = useGraphStore((s) => s.nodes);
  const visibleTypes = useGraphStore((s) => s.filters.types);
  const isolateTypeFilter = useGraphStore((s) => s.isolateTypeFilter);
  const themeMode = useThemeStore((s) => s.theme);
  const graphTheme = useMemo(() => buildGraphTheme(themeMode), [themeMode]);

  const colorForType = (type: string): string => {
    const style = graphTheme.nodeTypes[type] ?? graphTheme.defaultNodeStyle;
    return style.borderColor ?? graphTheme.defaultNodeStyle.borderColor;
  };

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
              style={{ background: active ? colorForType(t) : "transparent" }}
            />
            <span className="dynamic-legend-label">{t}</span>
            <span className="dynamic-legend-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
