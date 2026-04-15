// frontend/src/components/modals/SourcesModal.tsx
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { SourcesSidebar } from "./sources/SourcesSidebar";
import { SourceDetailPane } from "./sources/SourceDetailPane";
import { UnifiedToolbar } from "./sources/UnifiedToolbar";

export function SourcesModal() {
  const { activeModal, closeModal } = useUIStore();
  const sourcesModalTarget = useUIStore((s) => s.sourcesModalTarget);
  const setSourcesModalTarget = useUIStore((s) => s.setSourcesModalTarget);

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [selectedSyncIds, setSelectedSyncIds] = useState<Set<string>>(new Set());
  const [initialExpandSyncId, setInitialExpandSyncId] = useState<string | null>(null);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);

  // Consume sourcesModalTarget (from NodeDetailPanel "Open in Sources") once.
  useEffect(() => {
    if (!sourcesModalTarget || activeModal !== "sources") return;
    setActiveSourceId(sourcesModalTarget.sourceId);
    setInitialExpandSyncId(sourcesModalTarget.expandSyncId);
    setSelectedSourceIds(new Set());  // opening via deep-link clears any prior sidebar selection
    setSelectedSyncIds(new Set());
    setSourcesModalTarget(null);
  }, [sourcesModalTarget, activeModal, setSourcesModalTarget]);

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
    <Modal open={activeModal === "sources"} onClose={closeModal} title="Sources" size="lg">
      <div className="sources-modal">
        <UnifiedToolbar
          selectedSourceIds={selectedSourceIds}
          selectedSyncIds={selectedSyncIds}
          scheduleExpanded={scheduleExpanded}
          onToggleSchedule={() => setScheduleExpanded((v) => !v)}
          onSnapshotActionComplete={() => setSelectedSyncIds(new Set())}
          onSourceActionComplete={() => setSelectedSourceIds(new Set())}
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
