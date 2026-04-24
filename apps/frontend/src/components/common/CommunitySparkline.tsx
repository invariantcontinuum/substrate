interface Props {
  sizes: number[] | undefined;
}

export function CommunitySparkline({ sizes }: Props) {
  if (!sizes?.length) return null;
  const max = Math.max(...sizes);
  return (
    <div className="community-sparkline">
      {sizes.map((s, i) => (
        <div
          key={i}
          className="sparkline-bar"
          style={{ height: `${Math.round((s / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
