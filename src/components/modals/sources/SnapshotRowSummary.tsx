// frontend/src/components/modals/sources/SnapshotRowSummary.tsx
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SyncRun } from "@/hooks/useSyncs";

interface Props {
  run: SyncRun;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}

function formatTs(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function statusChip(status: string) {
  const cls = `snapshot-row-chip status-${status}`;
  return <span className={cls}>{status}</span>;
}

export function SnapshotRowSummary({ run, isSelected, isExpanded, onToggleSelect, onToggleExpand }: Props) {
  const hasIssues = run.status === "failed" || run.status === "cancelled";
  const isRunning = run.status === "running";
  const pct = run.progress_total > 0 ? Math.round((run.progress_done / run.progress_total) * 100) : 0;
  const phase = (run.progress_meta as { phase?: string } | null)?.phase ?? "";

  return (
    <div className={`snapshot-row-summary${isExpanded ? " is-expanded" : ""}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select snapshot ${run.id.slice(0, 8)}`}
      />
      <button
        type="button"
        className="snapshot-row-body"
        onClick={onToggleExpand}
        disabled={!hasIssues && !isRunning}
      >
        <span className="snapshot-row-ts">{formatTs(run.completed_at ?? run.created_at)}</span>
        {statusChip(run.status)}
        {isRunning && (
          <span className="snapshot-row-progress">
            <span className="snapshot-row-progress-text">{phase} {pct}%</span>
            <span className="snapshot-row-progress-bar">
              <span style={{ width: `${pct}%` }} />
            </span>
          </span>
        )}
        {hasIssues && (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </button>
    </div>
  );
}
