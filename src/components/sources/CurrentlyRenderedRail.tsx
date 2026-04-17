// frontend/src/components/sources/CurrentlyRenderedRail.tsx
//
// Sidebar rail listing every currently-loaded sync snapshot.
// Each row shows: source label (owner/name), relative timestamp, node count,
// and an unload (×) button. Clicking the row body deep-links to that source
// in the detail pane.

import { X } from "lucide-react";
import { useSyncSetStore } from "@/stores/syncSet";
import { useUIStore } from "@/stores/ui";
import { useSources } from "@/hooks/useSources";
import { useLoadedSyncs } from "@/hooks/useLoadedSyncs";

interface SyncStats {
  node_count?: number;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function formatNodeCount(n?: number): string {
  if (typeof n !== "number" || n <= 0) return "— nodes";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k nodes`;
  return `${n} nodes`;
}

export function CurrentlyRenderedRail() {
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const unload = useSyncSetStore((s) => s.unload);
  const setSourcesPageTarget = useUIStore((s) => s.setSourcesPageTarget);
  const { sources } = useSources();

  // Fetch individual sync details for each loaded sync ID.
  // Completed syncs are not returned by the running-only useSyncs poller,
  // so we need per-ID lookups via react-query.
  const loadedSyncs = useLoadedSyncs(syncIds);

  const sourceById = new Map(sources.map((s) => [s.id, s]));

  if (!syncIds || syncIds.length === 0) {
    return (
      <aside className="currently-rendered-rail">
        <div className="currently-rendered-header">Currently rendered</div>
        <div className="currently-rendered-empty muted">
          Nothing loaded — select snapshots from a source to render.
        </div>
      </aside>
    );
  }

  return (
    <aside className="currently-rendered-rail">
      <div className="currently-rendered-header">
        Currently rendered ({syncIds.length})
      </div>
      {syncIds.map((syncId, idx) => {
        const sync = loadedSyncs[idx];
        const source = sync ? sourceById.get(sync.source_id) : undefined;
        const label = source
          ? `${source.owner}/${source.name}`
          : "(unknown source)";
        const time = relativeTime(sync?.completed_at);
        const stats = sync?.stats as SyncStats | null | undefined;
        const nodes = formatNodeCount(stats?.node_count);

        return (
          <div
            key={syncId}
            data-role="rail-row"
            className="currently-rendered-row"
            role="button"
            tabIndex={0}
            onClick={() => {
              if (sync) {
                setSourcesPageTarget({
                  sourceId: sync.source_id,
                  expandSyncId: syncId,
                });
              }
            }}
          >
            <div className="currently-rendered-label">{label}</div>
            <div className="currently-rendered-meta muted">
              {time} · {nodes}
            </div>
            <button
              className="currently-rendered-unload"
              aria-label={`Unload ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                unload(syncId);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </aside>
  );
}
