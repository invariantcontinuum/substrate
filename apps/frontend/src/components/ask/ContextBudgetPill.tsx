import { useThreadContextFiles } from "@/hooks/useThreadContextFiles";

const BUDGET = 24000;

export function ContextBudgetPill({
  threadId,
  onOpenModal,
}: {
  threadId: string | null;
  onOpenModal: () => void;
}) {
  const { data } = useThreadContextFiles(threadId);
  if (!threadId || !data) return null;
  if (data.totals.file_count === 0) return null;
  const used = data.totals.included_token_total;
  const ratio = used / BUDGET;
  const cls =
    ratio > 1 ? "is-over" : ratio > 0.8 ? "is-warn" : "";
  return (
    <button
      type="button"
      className={`context-budget-pill ${cls}`}
      onClick={onOpenModal}
      title="Open context files"
    >
      {used.toLocaleString()} / {BUDGET.toLocaleString()} tokens ·{" "}
      {data.totals.file_count} files
    </button>
  );
}
