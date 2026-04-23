import { useRef, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAskStore } from "@/stores/ask";
import { useSendTurn } from "@/hooks/useAskMutations";

export function AskComposer({ threadId }: { threadId: string | null }) {
  const draft = useAskStore((s) => s.composerDraft);
  const setDraft = useAskStore((s) => s.setComposerDraft);
  const sending = useAskStore((s) => s.sendingTurn);
  const setSending = useAskStore((s) => s.setSendingTurn);
  const send = useSendTurn(threadId);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = draft.trim().length > 0 && !!threadId && !sending;

  const doSend = async () => {
    if (!canSend) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    try {
      await send.mutateAsync(content);
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
        placeholder={threadId ? "Ask about the graph…" : "Select or create a thread to start"}
        disabled={!threadId || sending}
        className="ask-composer-input"
        rows={3}
      />
      <Button onClick={doSend} disabled={!canSend} className="ask-composer-send">
        <Send size={14} /> {sending ? "Sending…" : "Send"}
      </Button>
    </div>
  );
}
