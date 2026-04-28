interface Props {
  tokens:     number;
  cap:        number;
  isEstimate: boolean;
}

export function ContextBudgetPill({ tokens, cap, isEstimate }: Props) {
  const ratio = cap > 0 ? tokens / cap : 0;
  const state =
    ratio >= 1   ? "over"   :
    ratio >= 0.8 ? "amber"  :
                   "neutral";
  const tooltip = ratio >= 1
    ? "Reduce context entries or raise context window in Settings → LLM Connections → dense"
    : undefined;
  return (
    <span className={`context-budget-pill state-${state}`} title={tooltip}>
      📊 {tokens.toLocaleString()} / {cap.toLocaleString()} tokens
      {isEstimate && <em className="estimate-badge"> (estimate)</em>}
    </span>
  );
}
