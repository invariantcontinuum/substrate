import { useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useAllSyncs } from "@/hooks/useAllSyncs";
import { useSyncSetStore } from "@/stores/syncSet";
import { SnapshotRow } from "@/components/sources/SnapshotRow";
import { SnapshotFilters, type SnapshotFilterState } from "@/components/sources/SnapshotFilters";
import { MassActionBar } from "@/components/sources/MassActionBar";

export function SourcesSnapshotsTab() {
  const { syncs, isLoading } = useAllSyncs();
  const [filters, setFilters] = useState<SnapshotFilterState>({
    sourceIds: new Set(), status: null, loadedOnly: false,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const syncSetIds = useSyncSetStore((s) => s.syncIds);
  const addSyncId = useSyncSetStore((s) => s.addSyncId);

  const filtered = useMemo(() => (syncs ?? []).filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.sourceIds.size && !filters.sourceIds.has(r.source_id)) return false;
    if (filters.loadedOnly && !syncSetIds.includes(r.id)) return false;
    return true;
  }), [syncs, filters, syncSetIds]);

  if (isLoading) return <div className="muted">Loading snapshots…</div>;

  const toggleExpand = (id: string) => setExpanded((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleSelect = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="snapshots-tab">
      <SnapshotFilters filters={filters} onChange={setFilters} />
      <Virtuoso
        style={{ height: "calc(100vh - 220px)" }}
        data={filtered}
        itemContent={(_i, r) => (
          <SnapshotRow
            run={r}
            isSelected={selected.has(r.id)}
            isExpanded={expanded.has(r.id)}
            onToggleSelect={() => toggleSelect(r.id)}
            onToggleExpand={() => toggleExpand(r.id)}
          />
        )}
      />
      <MassActionBar
        selection={selected}
        onLoadSelection={() => {
          for (const id of selected) addSyncId?.(id);
          setSelected(new Set());
        }}
        onClear={() => setSelected(new Set())}
      />
    </div>
  );
}
