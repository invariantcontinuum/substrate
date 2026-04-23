import { ArrowLeft } from "lucide-react";
import { useAskStore } from "@/stores/ask";
import type { AskThread } from "@/hooks/useAskThreads";

export function AskChatHeader({ thread }: { thread: AskThread | null }) {
  const setActive = useAskStore((s) => s.setActiveThreadId);
  if (!thread) return null;
  return (
    <header className="ask-chat-header">
      <button
        type="button"
        className="ask-back-btn"
        onClick={() => setActive(null)}
        aria-label="Back to thread list"
      >
        <ArrowLeft size={16} />
      </button>
      <h2 className="ask-chat-title">{thread.title}</h2>
    </header>
  );
}
