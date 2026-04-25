import type { ChatMessage } from "@/hooks/useChatMessages";
import { CitationChips } from "./CitationChips";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`ask-bubble ${isUser ? "is-user" : "is-assistant"}`}>
      <div className="ask-bubble-content">{message.content}</div>
      {!isUser && <CitationChips items={message.citations} />}
    </div>
  );
}
