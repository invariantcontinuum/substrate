import { ArrowLeft } from "lucide-react";
import { useChatStore } from "@/stores/chat";
import type { ChatThread } from "@/hooks/useChatThreads";

export function AskChatHeader({ thread }: { thread: ChatThread | null }) {
  const setActive = useChatStore((s) => s.setActiveThreadId);
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
