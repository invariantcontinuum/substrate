import { useGraphStore } from "@/stores/graph";

export function ViolationBadge() {
  const violations = useGraphStore((s) => s.violations);
  if (!violations.length) return null;

  return (
    <div className="violation-badge">
      <span className="violation-badge-dot" />
      <span>{violations.length} violation{violations.length > 1 ? "s" : ""}</span>
    </div>
  );
}
