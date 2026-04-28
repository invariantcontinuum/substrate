// Placeholder — T12 (ContextBudgetPill rewire) will rebuild this using
// useThreadEntries and useTokenizePrompt.
export function ContextBudgetPill({
  threadId: _threadId,
  onOpenModal,
}: {
  threadId: string | null;
  onOpenModal: () => void;
}) {
  return (
    <button
      type="button"
      className="context-budget-pill"
      onClick={onOpenModal}
    >
      Context
    </button>
  );
}
