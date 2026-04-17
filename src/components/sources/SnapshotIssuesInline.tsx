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
//
// Stats come from two sources depending on status:
//   - `run.stats`        is populated only when complete_sync_run fires,
//                        so completed rows show final counts + duration_ms.
//   - `run.progress_meta` is populated progressively by update_sync_progress,
//                        so running rows can surface live counts as ingestion
//                        walks through phases. We prefer stats when present
//                        and fall back to progress_meta so every field
//                        fills in the moment ingestion reports it instead
//                        of em-dashing until the sync completes.
export function SnapshotIssuesInline({ run }: Props) {
  const { issues, isLoading } = useSyncIssues(run.id, true);
  const renderMs = useGraphStore((s) => s.renderTimeBySyncId[run.id] ?? null);

  const stats = run.stats ?? {};
  const meta = run.progress_meta ?? null;

  const nodes          = stats.nodes           ?? meta?.nodes_total     ?? null;
  const edges          = stats.edges           ?? meta?.edges_total     ?? null;
  const filesEmbedded  = stats.files_embedded  ?? meta?.files_embedded  ?? null;
  const chunksTotal    = stats.chunks          ?? meta?.chunks_total    ?? null;
  const chunksEmbedded = stats.chunks_embedded ?? meta?.chunks_embedded ?? null;

  // Running syncs compute elapsed against now(). useSourceSyncs polls
  // every 5s while a sync is running, so the displayed time ticks up
  // in 5s jumps on each refetch-driven re-render.
  const syncMs = (() => {
    if (stats.duration_ms != null) return stats.duration_ms;
    if (!run.started_at) return null;
    const start = new Date(run.started_at).getTime();
    const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now();
    return end - start;
  })();

  return (
    <div className="sync-expanded-body">
      <section className="snapshot-stats-panel">
        <div className="snapshot-stats-title">Stats</div>
        <dl className="snapshot-stats-grid">
          <StatRow label="Nodes"          value={formatCount(nodes)} />
          <StatRow label="Edges"          value={formatCount(edges)} />
          <StatRow label="Files embedded" value={formatCount(filesEmbedded)} />
          <StatRow
            label="Chunks"
            value={
              chunksTotal != null
                ? `${formatCount(chunksTotal)} (embedded ${formatCount(chunksEmbedded ?? 0)})`
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
