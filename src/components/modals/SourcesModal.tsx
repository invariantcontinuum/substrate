// frontend/src/components/modals/SourcesModal.tsx
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { SourcesSidebar } from "./sources/SourcesSidebar";
import { SourceDetailPane } from "./sources/SourceDetailPane";
import { SourceOpsToolbar } from "./sources/SourceOpsToolbar";
import { SchedulePopover } from "./sources/SchedulePopover";
import { ConfigDialog } from "./sources/ConfigDialog";

export function SourcesModal() {
  const { activeModal, closeModal } = useUIStore();
  const sourcesModalTarget = useUIStore((s) => s.sourcesModalTarget);
  const setSourcesModalTarget = useUIStore((s) => s.setSourcesModalTarget);

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [scheduleDialogFor, setScheduleDialogFor] = useState<string | null>(null);
  const [configDialogFor, setConfigDialogFor] = useState<string | null>(null);
  const [initialExpandSyncId, setInitialExpandSyncId] = useState<string | null>(null);

  // Consume sourcesModalTarget (from NodeDetailPanel "Open in Sources") once when modal opens.
  useEffect(() => {
    if (!sourcesModalTarget || activeModal !== "sources") return;
    setActiveSourceId(sourcesModalTarget.sourceId);
    setInitialExpandSyncId(sourcesModalTarget.expandSyncId);
    setSourcesModalTarget(null);
  }, [sourcesModalTarget, activeModal, setSourcesModalTarget]);

  const toggleSelectSource = (id: string) => setSelectedSourceIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <Modal open={activeModal === "sources"} onClose={closeModal} title="Sources" size="lg">
      <div className="sources-modal">
        <SourceOpsToolbar
          selectedSourceIds={selectedSourceIds}
          onOpenSchedule={(id) => setScheduleDialogFor(id)}
          onOpenConfig={(id) => setConfigDialogFor(id)}
        />
        <div className="sources-modal-body">
          <SourcesSidebar
            activeSourceId={activeSourceId}
            selectedSourceIds={selectedSourceIds}
            onNavigate={(id) => setActiveSourceId(id)}
            onToggleSelect={toggleSelectSource}
          />
          <div className="sources-modal-detail">
            {activeSourceId ? (
              <SourceDetailPane
                sourceId={activeSourceId}
                onBack={() => setActiveSourceId(null)}
                autoExpandSyncId={initialExpandSyncId}
              />
            ) : (
              <div className="sources-modal-empty muted">Select a source from the sidebar to inspect its snapshots.</div>
            )}
          </div>
        </div>
        {scheduleDialogFor && (
          <SchedulePopover sourceId={scheduleDialogFor} onClose={() => setScheduleDialogFor(null)} />
        )}
        {configDialogFor && (
          <ConfigDialog sourceId={configDialogFor} onClose={() => setConfigDialogFor(null)} />
        )}
      </div>
    </Modal>
  );
}
