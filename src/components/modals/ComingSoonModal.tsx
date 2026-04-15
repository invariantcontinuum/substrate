import { Modal } from "@/components/ui/Modal";
import { useUIStore } from "@/stores/ui";

const DESCRIPTIONS: Record<string, string> = {
  policies: "Define and enforce architectural policies across your service graph.",
  adrs: "Track architecture decision records linked to your graph nodes.",
  drift: "Detect configuration drift and infrastructure inconsistencies.",
  query: "Run custom Cypher queries against the knowledge graph.",
};

export function ComingSoonModal({ name }: { name: string }) {
  const { activeModal, closeModal } = useUIStore();
  const title = name.charAt(0).toUpperCase() + name.slice(1);

  return (
    <Modal open={activeModal === name} onClose={closeModal} title={title} maxWidth={360}>
      <div className="coming-soon-modal">
        <div className="coming-soon-icon">&#x2692;</div>
        <div>
          <div className="coming-soon-title">Coming Soon</div>
          <div>{DESCRIPTIONS[name] || "This feature is under development."}</div>
        </div>
      </div>
    </Modal>
  );
}
