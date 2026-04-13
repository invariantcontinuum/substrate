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
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 float-anim">
          <span className="text-xl text-primary">&#x2692;</span>
        </div>
        <div>
          <div className="mb-1 text-sm font-bold text-foreground">Coming Soon</div>
          <div className="max-w-xs text-xs text-muted-foreground">
            {DESCRIPTIONS[name] || "This feature is under development."}
          </div>
        </div>
      </div>
    </Modal>
  );
}
