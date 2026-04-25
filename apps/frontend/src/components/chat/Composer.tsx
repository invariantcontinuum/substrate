import { useEffect, useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat";
import { useSendTurn, useCreateThread } from "@/hooks/useChatMutations";

export function Composer({ threadId }: { threadId: string | null }) {
  const draft = useChatStore((s) => s.composerDraft);
  const setDraft = useChatStore((s) => s.setComposerDraft);
  const streamingTurn = useChatStore((s) => s.streamingTurn);
  const setActiveThreadId = useChatStore((s) => s.setActiveThreadId);
  const send = useSendTurn();
  const createThread = useCreateThread();
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const isStreaming =
    streamingTurn != null && streamingTurn.threadId === threadId;
  const canSend = draft.trim().length > 0 && !isStreaming && !send.isPending;

  // Auto-grow textarea up to ~8 rows
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 8 * 24) + "px";
  }, [draft]);

  const doSend = async () => {
    if (!canSend) return;
    const content = draft.trim();
    setDraft("");
    let activeId = threadId;
    if (!activeId) {
      const created = await createThread.mutateAsync(undefined);
      activeId = created.id;
      setActiveThreadId(activeId);
    }
    await send.mutateAsync({ threadId: activeId, content });
    taRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  };

  return (
    <div className="composer">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder="Ask anything…"
        disabled={isStreaming}
        className="composer-input"
        rows={1}
      />
      <Button
        onClick={() => { void doSend(); }}
        disabled={!canSend}
        className="composer-send"
        aria-label="Send"
      >
        <Send size={14} />
      </Button>
    </div>
  );
}
