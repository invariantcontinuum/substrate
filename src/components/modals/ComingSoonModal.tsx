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
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <span style={{ color: "#6366f1", fontSize: 20 }}>&#x2692;</span>
        </div>
        <div>
          <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Coming Soon
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-muted)", maxWidth: 260 }}>
            {DESCRIPTIONS[name] || "This feature is under development."}
          </div>
        </div>
      </div>
    </Modal>
  );
}
