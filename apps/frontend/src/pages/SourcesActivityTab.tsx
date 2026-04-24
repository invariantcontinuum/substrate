import { Link } from "react-router-dom";
import { useActivity } from "@/hooks/useActivity";

const ICONS: Record<string, string> = {
  "sync.completed": "✓",
  "sync.failed": "✗",
  "sync.cleaned": "⌫",
  "leiden.computed": "◍",
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function SourcesActivityTab() {
  const { items, loading } = useActivity();
  if (loading) return <div className="muted">Loading activity…</div>;
  if (items.length === 0) return <div className="muted">No activity yet.</div>;
  return (
    <ul className="activity-list">
      {items.map((i) => (
        <li key={i.id} className="activity-item">
          <span className="activity-icon">{ICONS[i.kind] ?? "•"}</span>
          <div className="activity-body">
            <div className="activity-subject">
              {i.kind.startsWith("sync.") && i.detail?.sync_id ? (
                <Link to={`/sources/snapshots?focus=${String(i.detail.sync_id)}`}>
                  {i.subject ?? i.kind}
                </Link>
              ) : (i.subject ?? i.kind)}
            </div>
            <div className="activity-meta">{i.kind} · {formatTs(i.ts)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
