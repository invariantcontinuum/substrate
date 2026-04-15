// frontend/src/components/modals/sources/SourceDetailPane.tsx
import { useState } from "react";
import { useSources } from "@/hooks/useSources";
import { DetailHeader } from "./DetailHeader";
import { ScheduleStrip } from "./ScheduleStrip";
import { SnapshotList } from "./SnapshotList";
import { SnapshotOpsToolbar } from "./SnapshotOpsToolbar";

interface Props {
  sourceId: string;
  onBack?: () => void;
  autoExpandSyncId?: string | null;
}

export function SourceDetailPane({ sourceId, onBack, autoExpandSyncId }: Props) {
  const { sources } = useSources();
  const source = sources.find((s) => s.id === sourceId);
  const [selectedSyncIds, setSelectedSyncIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(
    autoExpandSyncId ? new Set([autoExpandSyncId]) : new Set()
  );

  const toggleSelect = (id: string) => setSelectedSyncIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleExpand = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="source-detail-pane">
      <DetailHeader source={source} snapshotCount={null} onBack={onBack} />
      {source && <ScheduleStrip sourceId={source.id} />}
      <SnapshotList
        sourceId={sourceId}
        selectedSyncIds={selectedSyncIds}
        toggleSelect={toggleSelect}
        expandedRows={expanded}
        toggleExpand={toggleExpand}
        autoExpandSyncId={autoExpandSyncId ?? null}
        autoScrollSyncId={autoExpandSyncId ?? null}
      />
      <SnapshotOpsToolbar
        selectedSyncIds={selectedSyncIds}
        onCleared={() => setSelectedSyncIds(new Set())}
      />
    </div>
  );
}
