import { useState, useMemo, useEffect } from "react";
import { useSources } from "@/hooks/useSources";
import { useSyncSetStore } from "@/stores/syncSet";
import { useUIStore } from "@/stores/ui";
import { AddSourceInput } from "@/components/sources/AddSourceInput";
import { SourceListItem } from "@/components/sources/SourceListItem";
import { SourceDetailPane } from "@/components/sources/SourceDetailPane";

export function SourcesTab() {
  const { sources, isLoading } = useSources();
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [selectedSyncIds, setSelectedSyncIds] = useState<Set<string>>(new Set());
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

  const toggleSourceSelect = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSyncSelect = (id: string) => {
    setSelectedSyncIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="sources-tab">
      <AddSourceInput onAdded={(id) => setActiveSourceId(id)} />
      <div className="sources-list">
        {sources?.map((s) => (
          <SourceListItem
            key={s.id}
            source={s}
            isActive={activeSourceId === s.id}
            isSelected={selectedSourceIds.has(s.id)}
            isLoaded={loadedSet.has(s.last_sync_id ?? "")}
            isRunning={false}
            onNavigate={() => setActiveSourceId(s.id)}
            onToggleSelect={() => toggleSourceSelect(s.id)}
          />
        ))}
      </div>
      {activeSourceId && (
        <SourceDetailPane
          sourceId={activeSourceId}
          onBack={() => setActiveSourceId(null)}
          autoExpandSyncId={autoExpandSyncId}
          selectedSyncIds={selectedSyncIds}
          toggleSelectSync={toggleSyncSelect}
        />
      )}
    </div>
  );
}
