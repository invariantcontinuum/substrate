import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useSourceSyncs } from "@/hooks/useSourceSyncs";
import { SnapshotRow } from "./SnapshotRow";

interface Props {
  sourceId: string;
  selectedSyncIds?: Set<string>;
  toggleSelect?: (syncId: string) => void;
  expandedRows: Set<string>;
  toggleExpand: (syncId: string) => void;
  autoExpandSyncId?: string | null;
  autoScrollSyncId?: string | null;
}

export function SnapshotList(props: Props) {
  const { items, isLoading, hasNextPage, fetchNextPage, isFetching } = useSourceSyncs(props.sourceId);
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  useEffect(() => {
    if (!props.autoScrollSyncId) return;
    const el = rowRefs.current.get(props.autoScrollSyncId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [props.autoScrollSyncId, items.length]);

  if (isLoading && items.length === 0) return <div className="snapshot-list muted">Loading…</div>;
  if (items.length === 0) return <div className="snapshot-list muted">No syncs yet for this source.</div>;

  return (
    <div className="snapshot-list">
      {items.map((run) => (
        <div key={run.id} ref={(el) => { rowRefs.current.set(run.id, el); }}>
          <SnapshotRow
            run={run}
            isSelected={props.selectedSyncIds?.has(run.id) ?? false}
            isExpanded={props.expandedRows.has(run.id)}
            onToggleSelect={props.toggleSelect ? () => props.toggleSelect!(run.id) : undefined}
            onToggleExpand={() => props.toggleExpand(run.id)}
          />
        </div>
      ))}
      {hasNextPage && (
        <div className="snapshot-list-paginator">
          <Button onClick={() => fetchNextPage()} disabled={isFetching}>
            {isFetching ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
