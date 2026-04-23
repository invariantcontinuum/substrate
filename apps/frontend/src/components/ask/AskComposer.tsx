import { useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAskStore } from "@/stores/ask";
import { useSendTurn, useCreateThread } from "@/hooks/useAskMutations";

export function AskComposer({ threadId }: { threadId: string | null }) {
  const draft = useAskStore((s) => s.composerDraft);
  const setDraft = useAskStore((s) => s.setComposerDraft);
  const sending = useAskStore((s) => s.sendingTurn);
  const setSending = useAskStore((s) => s.setSendingTurn);
  const setActiveThreadId = useAskStore((s) => s.setActiveThreadId);
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
    <div className="ask-composer">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder="Ask about the graph…"
        disabled={sending}
        className="ask-composer-input"
        rows={3}
      />
      <Button onClick={doSend} disabled={!canSend} className="ask-composer-send">
        <Send size={14} /> {sending ? "Sending…" : "Send"}
      </Button>
    </div>
  );
}
