import type { AskMessage } from "@/hooks/useAskMessages";
import { CitationChips } from "./CitationChips";

export function MessageBubble({ message }: { message: AskMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`ask-bubble ${isUser ? "is-user" : "is-assistant"}`}>
      <div className="ask-bubble-content">{message.content}</div>
      {!isUser && <CitationChips items={message.citations} />}
    </div>
  );
}
