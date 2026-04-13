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
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="border border-black p-3">
          <span className="text-xl">&#x2692;</span>
        </div>
        <div>
          <div className="font-bold">Coming Soon</div>
          <div>{DESCRIPTIONS[name] || "This feature is under development."}</div>
        </div>
      </div>
    </Modal>
  );
}
