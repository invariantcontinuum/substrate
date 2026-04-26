import { useNavigate } from "react-router-dom";
import { useChatContextStore } from "@/stores/chatContext";

export function ChatContextSummaryPill() {
  const active = useChatContextStore((s) => s.active);
  const navigate = useNavigate();
  const goToConfig = () => navigate("/account/chat-context");
  if (!active || active.sync_ids.length === 0) {
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
  const snapCount = active.sync_ids.length;
  const commCount = active.community_ids.length;
  return (
    <button
      type="button"
      className="chat-context-pill"
      onClick={goToConfig}
      title="Open chat context settings"
    >
      Context: {snapCount} snapshot{snapCount === 1 ? "" : "s"}
      {commCount > 0 && ` · ${commCount} ${commCount === 1 ? "community" : "communities"}`}
    </button>
  );
}
