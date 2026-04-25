export function EmptyState({ variant }: { variant: "no-thread" | "empty-thread" }) {
  const text = variant === "no-thread"
    ? "Create a new thread to start asking about the graph."
    : "Ask anything about the currently loaded sync set. Answers cite the nodes they come from.";
  return <div className={`chat-empty chat-empty-${variant}`}>{text}</div>;
}
