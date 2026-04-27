import { useNavigate } from "react-router-dom";
import { useChatContextStore } from "@/stores/chatContext";

export function ChatContextSummaryPill() {
  const active = useChatContextStore((s) => s.active);
  const navigate = useNavigate();
  const goToConfig = () => navigate("/account/chat-context");
  const syncIds = active?.sync_ids ?? [];
  const sourceIds = active?.source_ids ?? [];
  if (!active || (syncIds.length === 0 && sourceIds.length === 0)) {
    return (
      <button
        type="button"
        className="chat-context-pill is-empty"
        onClick={goToConfig}
        title="Apply a chat context in Settings → Chat Context"
      >
        Context: not applied
      </button>
    );
  }
  const snapCount = syncIds.length;
  const srcCount = sourceIds.length;
  const parts: string[] = [];
  if (snapCount > 0) {
    parts.push(`${snapCount} snapshot${snapCount === 1 ? "" : "s"}`);
  }
  if (srcCount > 0) {
    parts.push(`${srcCount} source${srcCount === 1 ? "" : "s"}`);
  }
  return (
    <button
      type="button"
      className="chat-context-pill"
      onClick={goToConfig}
      title="Open chat context settings"
    >
      Context: {parts.join(" · ")}
    </button>
  );
}
