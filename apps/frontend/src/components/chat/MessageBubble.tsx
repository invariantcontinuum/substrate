import type { ChatMessage } from "@/hooks/useChatMessages";
import { Citations } from "./Citations";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`chat-bubble ${isUser ? "is-user" : "is-assistant"}`}>
      <div className="chat-bubble-content">{message.content}</div>
      {!isUser && <Citations items={message.citations} />}
    </div>
  );
}
