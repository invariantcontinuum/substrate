import { useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat";
import { useSendTurn, useCreateThread } from "@/hooks/useChatMutations";

export function AskComposer({ threadId }: { threadId: string | null }) {
  const draft = useChatStore((s) => s.composerDraft);
  const setDraft = useChatStore((s) => s.setComposerDraft);
  const sending = useChatStore((s) => s.sendingTurn);
  const setSending = useChatStore((s) => s.setSendingTurn);
  const setActiveThreadId = useChatStore((s) => s.setActiveThreadId);
  const send = useSendTurn();
  const createThread = useCreateThread();
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = draft.trim().length > 0 && !sending;

  const doSend = async () => {
    if (!canSend) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    try {
      let activeId = threadId;
      if (!activeId) {
        const created = await createThread.mutateAsync(content.slice(0, 60));
        activeId = created.id;
        setActiveThreadId(activeId);
      }
      await send.mutateAsync({ threadId: activeId, content });
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  };

  return (
    <div className="chat-composer">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder="Ask about the graph…"
        disabled={sending}
        className="chat-composer-input"
        rows={3}
      />
      <Button onClick={doSend} disabled={!canSend} className="chat-composer-send">
        <Send size={14} /> {sending ? "Sending…" : "Send"}
      </Button>
    </div>
  );
}
