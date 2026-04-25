import { useState, useMemo, useEffect } from "react";
import { useSources } from "@/hooks/useSources";
import { useSyncSetStore } from "@/stores/syncSet";
import { useUIStore } from "@/stores/ui";
import { SourceListItem } from "@/components/sources/SourceListItem";
import { SourceDetailPane } from "@/components/sources/SourceDetailPane";
import { UnifiedToolbar } from "@/components/sources/UnifiedToolbar";

export function SourcesTab() {
  const { sources, isLoading } = useSources();
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  // `scheduleExpanded` toggles the toolbar Schedule button's visual state.
  // The companion overview panel UI lands in a follow-up task.
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [autoExpandSyncId, setAutoExpandSyncId] = useState<string | null>(null);
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const loadedSet = useMemo(() => new Set(syncIds), [syncIds]);
  const sourcesPageTarget = useUIStore((s) => s.sourcesPageTarget);
  const setSourcesPageTarget = useUIStore((s) => s.setSourcesPageTarget);

  useEffect(() => {
    if (!sourcesPageTarget) return;
    const t = sourcesPageTarget;
    queueMicrotask(() => {
      setActiveSourceId(t.sourceId);
      setAutoExpandSyncId(t.expandSyncId);
      setSourcesPageTarget(null);
    });
  }, [sourcesPageTarget, setSourcesPageTarget]);

  if (isLoading) return <div className="muted">Loading sources…</div>;

  return (
    <div className="sources-tab">
      <UnifiedToolbar
        scheduleExpanded={scheduleExpanded}
        onToggleSchedule={() => setScheduleExpanded((v) => !v)}
      />
      <div className="sources-list">
        {sources?.map((s) => (
          <SourceListItem
            key={s.id}
            source={s}
            isActive={activeSourceId === s.id}
            isLoaded={loadedSet.has(s.last_sync_id ?? "")}
            isRunning={false}
            onNavigate={() => setActiveSourceId(s.id)}
          />
        ))}
      </div>
      {activeSourceId && (
        <SourceDetailPane
          sourceId={activeSourceId}
          onBack={() => setActiveSourceId(null)}
          autoExpandSyncId={autoExpandSyncId}
        />
      )}
    </div>
  );
}
