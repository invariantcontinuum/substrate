import { useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useAllSyncs } from "@/hooks/useAllSyncs";
import { useSyncSetStore } from "@/stores/syncSet";
import { SnapshotRow } from "@/components/sources/SnapshotRow";
import {
  SnapshotFilters,
  type SnapshotFilterState,
} from "@/components/sources/SnapshotFilters";
import { UnifiedToolbar } from "@/components/sources/UnifiedToolbar";

export function SourcesSnapshotsTab() {
  const { syncs, isLoading } = useAllSyncs();
  const [filters, setFilters] = useState<SnapshotFilterState>({
    sourceIds: new Set(),
    status: null,
    loadedOnly: false,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // `scheduleExpanded` toggles the toolbar Schedule button's visual state.
  // The companion overview panel UI lands in a follow-up task.
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const syncSetIds = useSyncSetStore((s) => s.syncIds);

  const filtered = useMemo(
    () =>
      (syncs ?? []).filter((r) => {
        if (filters.status && r.status !== filters.status) return false;
        if (filters.sourceIds.size && !filters.sourceIds.has(r.source_id))
          return false;
        if (filters.loadedOnly && !syncSetIds.includes(r.id)) return false;
        return true;
      }),
    [syncs, filters, syncSetIds],
  );

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (isLoading) return <div className="muted">Loading snapshots…</div>;

  return (
    <div className="snapshots-tab">
      <UnifiedToolbar
        scheduleExpanded={scheduleExpanded}
        onToggleSchedule={() => setScheduleExpanded((v) => !v)}
      />
      <SnapshotFilters filters={filters} onChange={setFilters} />
      <Virtuoso
        style={{ height: "calc(100vh - 280px)" }}
        data={filtered}
        itemContent={(_i, r) => (
          <SnapshotRow
            run={r}
            isExpanded={expanded.has(r.id)}
            onToggleExpand={() => toggleExpand(r.id)}
          />
        )}
      />
    </div>
  );
}
