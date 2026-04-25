import type { ChatMessage } from "@/hooks/useChatMessages";
import { Citations } from "./Citations";

export function Message({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`message ${isUser ? "is-user" : "is-assistant"}`}>
      <div className="message-content">
        {message.content}
        {isStreaming && <span className="message-cursor">▍</span>}
      </div>
      {!isUser && message.citations && message.citations.length > 0 && (
        <Citations items={message.citations} />
      )}
    </div>
  );
}
