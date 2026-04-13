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
          className="w-14 h-14 rounded-2xl flex items-center justify-center float-anim"
          style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-medium)" }}
        >
          <span style={{ color: "var(--accent)", fontSize: 22 }}>&#x2692;</span>
        </div>
        <div>
          <div className="text-[15px] font-bold mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            Coming Soon
          </div>
          <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)", maxWidth: 260 }}>
            {DESCRIPTIONS[name] || "This feature is under development."}
          </div>
        </div>
      </div>
    </Modal>
  );
}
