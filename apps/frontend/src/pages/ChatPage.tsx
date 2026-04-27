import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useChatThreads } from "@/hooks/useChatThreads";
import { useChatMessages, type ChatMessage } from "@/hooks/useChatMessages";
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

  // Reset modal state when the thread identity changes, so a stale
  // open flag from a previous thread (or the brief no-thread window)
  // never causes the modal to auto-open after Send.
  useEffect(() => {
    setCtxOpen(false);
  }, [activeId]);

  useChatStream(activeId);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: streamingTurn ? "instant" : "smooth",
    });
  }, [messages?.length, streamingTurn?.content]);

  // ── Visible-vs-superseded grouping ──────────────────────────────────
  // Phase 7 introduces edit + regenerate. Both produce additional rows
  // on chat_messages with ``superseded_by`` pointing at the new turn
  // that replaced them. The chat list shows only active rows by default
  // and groups every superseded predecessor under a `<details>`
  // disclosure attached to the row that replaced them, so the user can
  // still audit the history without it cluttering the live thread.
  const { visible, supersededByOriginal } = useMemo(() => {
    const all = messages ?? [];
    const visibleArr: ChatMessage[] = [];
    const grouped: Record<string, ChatMessage[]> = {};
    for (const m of all) {
      if (m.superseded_by) {
        const key = m.superseded_by;
        (grouped[key] ||= []).push(m);
      } else {
        visibleArr.push(m);
      }
    }
    return { visible: visibleArr, supersededByOriginal: grouped };
  }, [messages]);

  const showPlaceholder = !activeId || !messages || visible.length === 0;

  return (
    <div className="chat-page">
      <PageHeader title={thread?.title ?? "New chat"} />
      <main className="chat-scroll">
        {showPlaceholder ? (
          <ChatPlaceholder />
        ) : (
          <>
            {visible.map((m) => {
              const previous = supersededByOriginal[m.id] ?? [];
              return (
                <Fragment key={m.id}>
                  <Message message={m} />
                  {previous.length > 0 && (
                    <details className="superseded-disclosure">
                      <summary>
                        Show {previous.length} previous{" "}
                        {previous.length === 1 ? "version" : "versions"}
                      </summary>
                      {previous.map((sm) => (
                        <Message key={sm.id} message={sm} muted />
                      ))}
                    </details>
                  )}
                </Fragment>
              );
            })}
            {streamingTurn && streamingTurn.threadId === activeId && (
              <Message
                message={{
                  id: streamingTurn.messageId,
                  role: "assistant",
                  content: streamingTurn.content,
                  citations: [],
                  created_at: new Date().toISOString(),
                } as ChatMessage}
                isStreaming
              />
            )}
            <div ref={endRef} />
          </>
        )}
      </main>
      <ContextBudgetPill
        threadId={activeId}
        onOpenModal={() => setCtxOpen(true)}
      />
      <Composer threadId={activeId} />
      <ContextFilesModal
        threadId={activeId}
        isOpen={ctxOpen}
        onClose={() => setCtxOpen(false)}
      />
    </div>
  );
}
