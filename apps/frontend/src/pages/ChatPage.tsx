import { useEffect, useRef, useState } from "react";
import { useChatThreads } from "@/hooks/useChatThreads";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatStore } from "@/stores/chat";
import { useChatStream } from "@/hooks/useChatStream";
import { Message } from "@/components/chat/Message";
import { Composer } from "@/components/chat/Composer";
import { ChatPlaceholder } from "@/components/chat/ChatPlaceholder";
import { ContextBudgetPill } from "@/components/chat/ContextBudgetPill";
import { ContextFilesModal } from "@/components/chat/ContextFilesModal";
import { PageHeader } from "@/components/layout/PageHeader";

export function ChatPage() {
  const activeId = useChatStore((s) => s.activeThreadId);
  const streamingTurn = useChatStore((s) => s.streamingTurn);
  const { data: threads } = useChatThreads();
  const { data: messages } = useChatMessages(activeId);
  const thread = threads?.find((t) => t.id === activeId) ?? null;
  const [ctxOpen, setCtxOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useChatStream(activeId);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, streamingTurn?.content]);

  const showPlaceholder = !activeId || !messages || messages.length === 0;

  return (
    <div className="chat-page">
      <PageHeader title={thread?.title ?? "New chat"} />
      <main className="chat-scroll">
        {showPlaceholder ? (
          <ChatPlaceholder />
        ) : (
          <>
            {messages.map((m) => <Message key={m.id} message={m} />)}
            {streamingTurn && streamingTurn.threadId === activeId && (
              <Message
                message={{
                  id: streamingTurn.messageId,
                  role: "assistant",
                  content: streamingTurn.content,
                  citations: [],
                  created_at: new Date().toISOString(),
                } as never}
                isStreaming
              />
            )}
            <div ref={endRef} />
          </>
        )}
      </main>
      <ContextBudgetPill threadId={activeId} onOpenModal={() => setCtxOpen(true)} />
      <Composer threadId={activeId} />
      {activeId && (
        <ContextFilesModal threadId={activeId} isOpen={ctxOpen} onClose={() => setCtxOpen(false)} />
      )}
    </div>
  );
}
