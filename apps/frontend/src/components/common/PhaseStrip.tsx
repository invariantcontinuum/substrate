interface Props {
  phases: Record<string, number>;
}

const numFmt = new Intl.NumberFormat("en-US");

export function PhaseStrip({ phases }: Props) {
  const entries = Object.entries(phases);
  return (
    <div
      className="phase-strip"
      role="img"
      aria-label={`Phases: ${entries.map(([p, ms]) => `${p} ${numFmt.format(ms)}ms`).join(", ")}`}
    >
      {entries.map(([p, ms]) => (
        <div key={p} className="phase-strip-seg" style={{ flex: ms }} title={`${p}: ${numFmt.format(ms)} ms`}>
          <span className="phase-strip-label">{p}</span>
        </div>
      ))}
    </div>
  );
}
