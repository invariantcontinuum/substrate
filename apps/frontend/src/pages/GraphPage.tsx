import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { CarouselEngine } from "@/components/carousel/CarouselEngine";
import { NodeDetailPanel } from "@/components/panels/NodeDetailPanel";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * Graph page = canvas + bottom carousel strip + a single floating
 * GraphToolbar in the top-right corner. Tapping a node selects it but
 * does not auto-open inspection — the user clicks the Info button on
 * the toolbar (which pulses on selection) to open the modal.
 */
export function GraphPage() {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const isOpen = activeModal === "nodeDetail";
  const close = () => {
    setSelectedNodeId(null);
    closeModal();
  };
  return (
    <div className="graph-page">
      <PageHeader title="Graph" />
      <div className="graph-canvas-wrapper">
        <GraphCanvas />
      </div>
      <CarouselEngine />
      <Modal
        open={isOpen}
        onClose={close}
        title=""
        size="lg"
        contentClassName="node-detail-modal"
      >
        <NodeDetailPanel />
      </Modal>
    </div>
  );
}
