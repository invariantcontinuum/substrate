import { AskThreadRail } from "@/components/chat/AskThreadRail";
import { AskChatPane } from "@/components/chat/AskChatPane";

export function ChatPage() {
  return (
    <div className="chat-page">
      <AskThreadRail />
      <AskChatPane />
    </div>
  );
}
