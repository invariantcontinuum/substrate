import { communityPaletteHex } from "@/lib/palette";

interface Props {
  sizes: number[] | undefined;
}

export function CommunityHistogram({ sizes }: Props) {
  if (!sizes?.length) return <div className="community-histogram-empty">no community data</div>;
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="community-histogram">
      {sizes.map((s, i) => (
        <div
          key={i}
          className="community-histogram-bar"
          style={{ flex: s, backgroundColor: communityPaletteHex(i) }}
          title={`community ${i}: ${s} nodes (${((s / total) * 100).toFixed(1)}%)`}
        />
      ))}
    </div>
  );
}
