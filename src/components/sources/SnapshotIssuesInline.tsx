import { useSyncIssues } from "@/hooks/useSyncIssues";
import type { SyncRun } from "@/hooks/useSyncs";
import { useGraphStore } from "@/stores/graph";
import { formatCount, formatDuration } from "@/lib/formatStats";

const MAX_RENDERED = 100;

interface Props {
  run: SyncRun;
}

// Render the expanded body for a snapshot row: always-visible stats
// panel, followed by a list of structured issues when present. Replaces
// the pre-bundle behaviour that showed only issues (plus a Retry
// button). Retry moved to the unified toolbar's Resync flow.
export function SnapshotIssuesInline({ run }: Props) {
  const { issues, isLoading } = useSyncIssues(run.id, true);
  const renderMs = useGraphStore((s) => s.renderTimeBySyncId[run.id] ?? null);

  const stats = run.stats ?? {};
  const syncMs = stats.duration_ms
    ?? (run.started_at && run.completed_at
        ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
        : null);

  return (
    <div className="sync-expanded-body">
      <section className="snapshot-stats-panel">
        <div className="snapshot-stats-title">Stats</div>
        <dl className="snapshot-stats-grid">
          <StatRow label="Nodes"          value={formatCount(stats.nodes)} />
          <StatRow label="Edges"          value={formatCount(stats.edges)} />
          <StatRow label="Files embedded" value={formatCount(stats.files_embedded)} />
          <StatRow
            label="Chunks"
            value={
              stats.chunks != null
                ? `${formatCount(stats.chunks)} (embedded ${formatCount(stats.chunks_embedded ?? 0)})`
                : "—"
            }
          />
          <StatRow label="Sync time"   value={formatDuration(syncMs)} />
          <StatRow label="Render time" value={formatDuration(renderMs)} />
        </dl>
      </section>

      {isLoading && (
        <div className="sync-issues-inline muted">Loading issues…</div>
      )}
      {!isLoading && issues.length > 0 && (
        <section className="sync-issues-inline">
          <div className="sync-issues-inline-header">
            <span className="label">
              {issues.length} issue{issues.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="sync-issues-inline-list">
            {issues.slice(0, MAX_RENDERED).map((issue) => (
              <li key={issue.id} className={`sync-issue level-${issue.level}`}>
                <span className="lvl">{issue.level.toUpperCase()}</span>
                <span className="meta">
                  {issue.phase}{issue.code ? ` · ${issue.code}` : ""}
                </span>
                <div className="msg">{issue.message}</div>
              </li>
            ))}
          </ul>
          {issues.length > MAX_RENDERED && (
            <div className="sync-issues-inline-truncation muted">
              + {issues.length - MAX_RENDERED} more not shown
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="snapshot-stats-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
