interface Props {
  label: string;
  value: string | number;
}

export function StatPill({ label, value }: Props) {
  return (
    <span className="stat-pill">
      <span className="stat-pill-label">{label}</span>
      <span className="stat-pill-value">{value}</span>
    </span>
  );
}
