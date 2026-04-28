import { Fragment, useEffect, useMemo, useRef } from "react";
import { useChatThreads } from "@/hooks/useChatThreads";
import { useChatMessages, type ChatMessage } from "@/hooks/useChatMessages";
import { useChatStore } from "@/stores/chat";
import { useChatStream } from "@/hooks/useChatStream";
import { useArchiveThread, useUnarchiveThread } from "@/hooks/useChatSettings";
import { Message } from "@/components/chat/Message";
import { Composer } from "@/components/chat/Composer";
import { ChatPlaceholder } from "@/components/chat/ChatPlaceholder";
import { PageHeader } from "@/components/layout/PageHeader";

export function ChatPage() {
  const activeId = useChatStore((s) => s.activeThreadId);
  const setActiveThreadId = useChatStore((s) => s.setActiveThreadId);
  const streamingTurn = useChatStore((s) => s.streamingTurn);
  const { data: threads } = useChatThreads();
  const { data: messages } = useChatMessages(activeId);
  const thread = threads?.find((t) => t.id === activeId) ?? null;
  const archive = useArchiveThread();
  const unarchive = useUnarchiveThread();
  const endRef = useRef<HTMLDivElement | null>(null);

  useChatStream(activeId);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: streamingTurn ? "instant" : "smooth",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length, streamingTurn?.content]);

  // ── Visible-vs-superseded grouping ──────────────────────────────────
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

  const active = (threads ?? []).filter((t) => !t.archived_at);
  const archived = (threads ?? []).filter((t) => !!t.archived_at);

  return (
    <div className="chat-page">
      <aside className="chat-sidebar">
        <h3 className="chat-sidebar-heading">Active</h3>
        <ul className="chat-thread-list">
          {active.map((t) => (
            <li
              key={t.id}
              className={`chat-thread-item${activeId === t.id ? " is-active" : ""}`}
            >
              <button
                className="chat-thread-btn"
                onClick={() => setActiveThreadId(t.id)}
              >
                {t.title}
              </button>
              <button
                className="chat-thread-action"
                onClick={() => archive.mutate(t.id)}
                aria-label="Archive thread"
                title="Archive"
              >
                ↓
              </button>
            </li>
          ))}
        </ul>
        {archived.length > 0 && (
          <details className="chat-archived-section">
            <summary className="chat-sidebar-heading">
              Archived ({archived.length})
            </summary>
            <ul className="chat-thread-list">
              {archived.map((t) => (
                <li
                  key={t.id}
                  className={`chat-thread-item${activeId === t.id ? " is-active" : ""}`}
                >
                  <button
                    className="chat-thread-btn"
                    onClick={() => setActiveThreadId(t.id)}
                  >
                    {t.title}
                  </button>
                  <button
                    className="chat-thread-action"
                    onClick={() => unarchive.mutate(t.id)}
                    aria-label="Unarchive thread"
                    title="Unarchive"
                  >
                    ↑
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>
      <div className="chat-main">
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
        <Composer threadId={activeId} />
      </div>
    </div>
  );
}
