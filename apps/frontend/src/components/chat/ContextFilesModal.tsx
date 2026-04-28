import { Modal } from "@/components/ui/Modal";

// Placeholder — T10 (ContextPickerModal) will replace this with a full
// implementation using useThreadEntries from the new chat-context API.
export function ContextFilesModal({
  threadId: _threadId,
  isOpen,
  onClose,
}: {
  threadId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Context for this chat"
      size="lg"
      contentClassName="ctx-files-modal"
    >
      <p className="muted">Context picker coming soon.</p>
    </Modal>
  );
}
