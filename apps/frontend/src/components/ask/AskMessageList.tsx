import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAskMessages } from "@/hooks/useAskMessages";
import { useAskStore } from "@/stores/ask";
import { MessageBubble } from "./MessageBubble";
import { EmptyState } from "./EmptyState";

export function AskMessageList({ threadId }: { threadId: string | null }) {
  const { data: messages, isLoading } = useAskMessages(threadId);
  const sending = useAskStore((s) => s.sendingTurn);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, sending]);

  if (!threadId) return <EmptyState variant="no-thread" />;
  if (isLoading) return <div className="ask-list-loading"><Loader2 size={16} /></div>;
  if (!messages || messages.length === 0) return <EmptyState variant="empty-thread" />;

  return (
    <div className="ask-list">
      {messages.map((m) => <MessageBubble key={m.id} message={m} />)}
      {sending && (
        <div className="ask-bubble is-assistant is-typing">
          <Loader2 size={14} /> thinking…
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
