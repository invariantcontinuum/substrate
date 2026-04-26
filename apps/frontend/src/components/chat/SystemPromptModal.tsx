import { Modal } from "@/components/ui/Modal";

/**
 * Bare-bones modal that surfaces just the system prompt for an assistant
 * turn. The same content is reachable via ContextViewModal's first
 * disclosure, but exposing a one-click affordance for the prompt alone
 * is significantly faster when the user just wants to copy / inspect
 * the instructions block.
 */
export function SystemPromptModal({
  open,
  onClose,
  systemPrompt,
}: {
  open: boolean;
  onClose: () => void;
  systemPrompt: string;
}) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="System prompt" size="md">
      <pre className="context-pre">{systemPrompt || "(empty)"}</pre>
    </Modal>
  );
}
