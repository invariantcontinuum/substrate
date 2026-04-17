import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSyncIssues } from "@/hooks/useSyncIssues";
import { useSyncs } from "@/hooks/useSyncs";

const MAX_RENDERED = 100;

interface Props {
  syncId: string;
}

export function SnapshotIssuesInline({ syncId }: Props) {
  const { issues, isLoading } = useSyncIssues(syncId, true);
  const { retrySync } = useSyncs();

  if (isLoading) return <div className="sync-issues-inline muted">Loading issues…</div>;
  if (issues.length === 0) {
    return (
      <div className="sync-issues-inline">
        <div className="muted">No structured issues recorded.</div>
        <Button onClick={() => retrySync(syncId)}>
          <RefreshCw size={12} /> Retry
        </Button>
      </div>
    );
  }

  const shown = issues.slice(0, MAX_RENDERED);
  const hidden = Math.max(0, issues.length - MAX_RENDERED);

  return (
    <div className="sync-issues-inline">
      <div className="sync-issues-inline-header">
        <span className="label">{issues.length} issue{issues.length === 1 ? "" : "s"}</span>
        <Button onClick={() => retrySync(syncId)}>
          <RefreshCw size={12} /> Retry
        </Button>
      </div>
      <ul className="sync-issues-inline-list">
        {shown.map((issue) => (
          <li key={issue.id} className={`sync-issue level-${issue.level}`}>
            <span className="lvl">{issue.level.toUpperCase()}</span>
            <span className="meta">{issue.phase}{issue.code ? ` · ${issue.code}` : ""}</span>
            <div className="msg">{issue.message}</div>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <div className="sync-issues-inline-truncation muted">
          + {hidden} more not shown
        </div>
      )}
    </div>
  );
}
