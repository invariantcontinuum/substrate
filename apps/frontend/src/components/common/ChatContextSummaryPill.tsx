import { useNavigate } from "react-router-dom";
import { useChatContextStore } from "@/stores/chatContext";

export function ChatContextSummaryPill() {
  const active = useChatContextStore((s) => s.active);
  const navigate = useNavigate();
  const goToConfig = () => navigate("/account/chat-context");
  const syncIds = active?.sync_ids ?? [];
  const communityIds = active?.community_ids ?? [];
  if (!active || syncIds.length === 0) {
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
  const commCount = communityIds.length;
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
