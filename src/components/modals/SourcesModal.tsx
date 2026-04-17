// frontend/src/components/modals/SourcesModal.tsx
// NOTE: This file is deleted in Task 9. It is kept here to avoid
// breaking the build during the intermediate Task 8 commit.
// The modal is no longer mounted via ModalRoot (sources was removed from
// ModalName). Navigation now uses useUIStore.activeView === "sources".
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { SourcesSidebar } from "./sources/SourcesSidebar";
import { SourceDetailPane } from "./sources/SourceDetailPane";
import { UnifiedToolbar } from "./sources/UnifiedToolbar";

export function SourcesModal() {
  const { closeModal } = useUIStore();
  const activeView = useUIStore((s) => s.activeView);
  const sourcesPageTarget = useUIStore((s) => s.sourcesPageTarget);
  const setSourcesPageTarget = useUIStore((s) => s.setSourcesPageTarget);

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [selectedSyncIds, setSelectedSyncIds] = useState<Set<string>>(new Set());
  const [initialExpandSyncId, setInitialExpandSyncId] = useState<string | null>(null);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);

  // Consume sourcesPageTarget (from NodeDetailPanel "Open in Sources") once.
  useEffect(() => {
    if (!sourcesPageTarget || activeView !== "sources") return;
    setActiveSourceId(sourcesPageTarget.sourceId);
    setInitialExpandSyncId(sourcesPageTarget.expandSyncId);
    setSelectedSourceIds(new Set());  // opening via deep-link clears any prior sidebar selection
    setSelectedSyncIds(new Set());
    setSourcesPageTarget(null);
  }, [sourcesPageTarget, activeView, setSourcesPageTarget]);

  // When the user navigates to a different source, clear both selections —
  // sidebar (user's intent is now the detail view, not bulk source-ops)
  // and any snapshot checks carried over from the previous source.
  const navigateToSource = (id: string) => {
    setActiveSourceId(id);
    setSelectedSourceIds(new Set());
    setSelectedSyncIds(new Set());
    setScheduleExpanded(false);
    setInitialExpandSyncId(null);
  };

  const backToSidebar = () => {
    setActiveSourceId(null);
    setSelectedSyncIds(new Set());
    setInitialExpandSyncId(null);
  };

  const toggleSelectSource = (id: string) => setSelectedSourceIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleSelectSync = (id: string) => setSelectedSyncIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <Modal open={activeView === "sources"} onClose={closeModal} title="Sources" size="lg">
      <div className="sources-modal">
        <UnifiedToolbar
          selectedSourceIds={selectedSourceIds}
          selectedSyncIds={selectedSyncIds}
          scheduleExpanded={scheduleExpanded}
          onToggleSchedule={() => setScheduleExpanded((v) => !v)}
          onSnapshotActionComplete={() => setSelectedSyncIds(new Set())}
          onSourceActionComplete={() => setSelectedSourceIds(new Set())}
          onAlreadyActive={(syncId, sourceId) => {
            setActiveSourceId(sourceId);
            setInitialExpandSyncId(syncId);
          }}
        />
        <div className={`sources-modal-body${activeSourceId ? " has-active-source" : ""}`}>
          <SourcesSidebar
            activeSourceId={activeSourceId}
            selectedSourceIds={selectedSourceIds}
            onNavigate={navigateToSource}
            onToggleSelect={toggleSelectSource}
          />
          <div className="sources-modal-detail">
            {activeSourceId ? (
              <SourceDetailPane
                key={activeSourceId}
                sourceId={activeSourceId}
                onBack={backToSidebar}
                autoExpandSyncId={initialExpandSyncId}
                selectedSyncIds={selectedSyncIds}
                toggleSelectSync={toggleSelectSync}
              />
            ) : (
              <div className="sources-modal-empty muted">Select a source from the sidebar to inspect its snapshots.</div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
