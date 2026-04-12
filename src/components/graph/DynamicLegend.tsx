import type { LegendSummary } from "@invariantcontinuum/graph/react";

interface Props {
  legend: LegendSummary | null;
}

export function DynamicLegend({ legend }: Props) {
  if (!legend) return null;
  const hasContent = legend.node_types.length > 0 || legend.edge_types.length > 0;
  if (!hasContent) return null;
  return (
    <div
      className="absolute bottom-3 right-3 hidden sm:flex flex-col gap-1.5 text-[10px] font-mono"
      style={{ color: "#4a4a60" }}
    >
      {legend.node_types.map((entry) => (
        <div key={`node-${entry.type_key}`} className="flex items-center gap-1.5">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ background: entry.border_color || entry.color }}
          />
          {entry.label || entry.type_key}
        </div>
      ))}
      {legend.edge_types.map((entry) => {
        const borderStyle =
          entry.dash === "dashed"
            ? "1px dashed"
            : entry.dash === "dotted"
            ? "1px dotted"
            : "none";
        return (
          <div key={`edge-${entry.type_key}`} className="flex items-center gap-1.5">
            <div
              className="w-3 h-0.5"
              style={{
                background: entry.color,
                borderBottom: borderStyle,
              }}
            />
            {entry.label || entry.type_key}
          </div>
        );
      })}
    </div>
  );
}
