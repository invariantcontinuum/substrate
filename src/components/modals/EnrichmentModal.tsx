import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";
import { Sparkles } from "lucide-react";

export function EnrichmentModal() {
  const { activeModal, closeModal } = useUIStore();

  return (
    <Modal open={activeModal === "enrichment"} onClose={closeModal} title="Enrichment" maxWidth={480}>
      <div className="enrichment-modal">
        <p style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Sparkles size={16} /> Standalone enrichment is being refactored.
        </p>
        <p>
          LLM-generated summaries and embeddings now run inline during sync.
          A dedicated re-enrichment workflow will return in a future update.
        </p>
      </div>
    </Modal>
  );
}
