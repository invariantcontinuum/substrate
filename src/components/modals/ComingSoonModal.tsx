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
      <div className="flex flex-col items-center gap-6 py-10 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 float-anim"
        >
          <span className="text-[22px] text-primary">&#x2692;</span>
        </div>
        <div>
          <div className="mb-2 text-[15px] font-bold text-foreground">
            Coming Soon
          </div>
          <div className="max-w-[260px] text-xs leading-relaxed text-muted-foreground">
            {DESCRIPTIONS[name] || "This feature is under development."}
          </div>
        </div>
      </div>
    </Modal>
  );
}
