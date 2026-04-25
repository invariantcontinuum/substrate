import { useNavigate } from "react-router-dom";
import { useChatContextStore } from "@/stores/chatContext";
import { useSources } from "@/hooks/useSources";

export function ChatContextSummaryPill() {
  const active = useChatContextStore((s) => s.active);
  const { sources } = useSources();
  const navigate = useNavigate();
  const goToConfig = () => navigate("/sources/config");
  if (!active) {
    return (
      <button
        type="button"
        className="chat-context-pill is-empty"
        onClick={goToConfig}
        title="Apply a chat context in Sources Config"
      >
        Context: not applied
      </button>
    );
  }
  const src = sources?.find((s) => s.id === active.source_id);
  const label = src ? `${src.owner}/${src.name}` : active.source_id.slice(0, 8);
  const snapCount = active.snapshot_ids.length;
  const commCount = active.community_ids.length;
  return (
    <button
      type="button"
      className="chat-context-pill"
      onClick={goToConfig}
      title="Open chat context settings"
    >
      Context: {label} · {snapCount} snapshot{snapCount === 1 ? "" : "s"}
      {commCount > 0 && ` · ${commCount} ${commCount === 1 ? "community" : "communities"}`}
    </button>
  );
}
