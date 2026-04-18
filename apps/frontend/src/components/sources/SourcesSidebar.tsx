// frontend/src/components/sources/SourcesSidebar.tsx
import { useSources } from "@/hooks/useSources";
import { useSyncSetStore } from "@/stores/syncSet";
import { useSyncs } from "@/hooks/useSyncs";
import { SourceListItem } from "./SourceListItem";
import { AddSourceInput } from "./AddSourceInput";

interface Props {
  activeSourceId: string | null;
  selectedSourceIds: Set<string>;
  onNavigate: (sourceId: string) => void;
  onToggleSelect: (sourceId: string) => void;
}

export function SourcesSidebar({ activeSourceId, selectedSourceIds, onNavigate, onToggleSelect }: Props) {
  const { sources } = useSources();
  const loadedSyncIds = useSyncSetStore((s) => s.syncIds);
  const sourceMap = useSyncSetStore((s) => s.sourceMap);
  const { activeSyncs } = useSyncs();

  const loadedSourceIds = new Set(
    loadedSyncIds.map((id) => sourceMap.get(id)).filter(Boolean) as string[]
  );
  const runningSourceIds = new Set(activeSyncs.map((r) => r.source_id));

  return (
    <aside className="sources-sidebar">
      <div className="sources-sidebar-add">
        <AddSourceInput onAdded={onNavigate} />
      </div>
      <div className="sources-sidebar-list">
        {sources.map((s) => (
          <SourceListItem
            key={s.id}
            source={s}
            isActive={s.id === activeSourceId}
            isSelected={selectedSourceIds.has(s.id)}
            isLoaded={loadedSourceIds.has(s.id)}
            isRunning={runningSourceIds.has(s.id)}
            onNavigate={() => onNavigate(s.id)}
            onToggleSelect={() => onToggleSelect(s.id)}
          />
        ))}
        {sources.length === 0 && (
          <div className="sources-sidebar-empty muted">Paste a GitHub URL above to start.</div>
        )}
      </div>
      <div className="sources-sidebar-footer muted">
        {sources.length} source{sources.length === 1 ? "" : "s"}
      </div>
    </aside>
  );
}
