// frontend/src/components/modals/sources/SourceDetailPane.tsx
import { useState } from "react";
import { useSources } from "@/hooks/useSources";
import { DetailHeader } from "./DetailHeader";
import { ScheduleStrip } from "./ScheduleStrip";
import { SnapshotList } from "./SnapshotList";

interface Props {
  sourceId: string;
  onBack?: () => void;
  autoExpandSyncId?: string | null;
  selectedSyncIds: Set<string>;
  toggleSelectSync: (id: string) => void;
}

export function SourceDetailPane({ sourceId, onBack, autoExpandSyncId, selectedSyncIds, toggleSelectSync }: Props) {
  const { sources } = useSources();
  const source = sources.find((s) => s.id === sourceId);
  const [expanded, setExpanded] = useState<Set<string>>(
    autoExpandSyncId ? new Set([autoExpandSyncId]) : new Set()
  );
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
        toggleSelect={toggleSelectSync}
        expandedRows={expanded}
        toggleExpand={toggleExpand}
        autoExpandSyncId={autoExpandSyncId ?? null}
        autoScrollSyncId={autoExpandSyncId ?? null}
      />
    </div>
  );
}
