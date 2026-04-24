import { formatCount } from "@/lib/formatStats";

interface Props {
  label: string;
  value: string | number;
}

export function StatBox({ label, value }: Props) {
  const display = typeof value === "number" ? formatCount(value) : value;
  return (
    <div className="stat-box">
      <div className="stat-box-value">{display}</div>
      <div className="stat-box-label">{label}</div>
    </div>
  );
}
