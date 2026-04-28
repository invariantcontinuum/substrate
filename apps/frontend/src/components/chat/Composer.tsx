import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextChipRow } from "./ContextChipRow";
import { ContextPickerModal } from "./ContextPickerModal";
import { ContextBudgetPill } from "./ContextBudgetPill";
import { useThreadEntries, useApplyThreadEntries } from "@/hooks/useThreadEntries";
import { useTokenizePrompt } from "@/hooks/useTokenizePrompt";
import { useEffectiveConfig } from "@/hooks/useRuntimeConfig";
import { useSendTurn, useCreateThread } from "@/hooks/useChatMutations";
import { useCancelStream } from "@/hooks/useCancelStream";
import { useChatStore } from "@/stores/chat";
import type { Entry } from "@/types/chat";

interface LlmDenseConfig {
  context_window_tokens?: number;
}

export function Composer({ threadId }: { threadId: string | null }) {
  const draft = useChatStore((s) => s.composerDraft);
  const setDraft = useChatStore((s) => s.setComposerDraft);
  const streamingTurn = useChatStore((s) => s.streamingTurn);
  const setStreamingTurn = useChatStore((s) => s.setStreamingTurn);
  const setActiveThreadId = useChatStore((s) => s.setActiveThreadId);

  const send = useSendTurn();
  const createThread = useCreateThread();
  const cancel = useCancelStream();
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);

  const ctx = useThreadEntries(threadId);
  const apply = useApplyThreadEntries(threadId ?? "");

  const entries: Entry[] = ctx.data?.entries ?? [];
  const frozenAt = ctx.data?.frozen_at ?? null;

  const { config: denseConfig } = useEffectiveConfig<LlmDenseConfig>("llm_dense");
  const cap = denseConfig.context_window_tokens ?? 24_000;

  const tk = useTokenizePrompt(entries, draft);
  const rawTokens = tk.data?.tokens;
  const tokens = rawTokens != null ? rawTokens : Math.ceil((tk.data?.prompt_chars ?? 0) / 4);

  const overBudget = tokens > cap;

  const isStreaming =
    streamingTurn != null && streamingTurn.threadId === threadId;
  const canStop = isStreaming && !cancel.isPending;

  // Send is enabled only when: not streaming, not pending, has entries, not over budget, has text
  const sendDisabled =
    isStreaming ||
    send.isPending ||
    entries.length === 0 ||
    overBudget ||
    draft.trim().length === 0;

  // Auto-grow textarea up to ~8 rows
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 8 * 24) + "px";
  }, [draft]);

  const doSend = async () => {
    if (sendDisabled || isStreaming) return;
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

  const doStop = () => {
    if (!streamingTurn) return;
    const messageId = streamingTurn.messageId;
    setStreamingTurn(null);
    cancel.mutate(messageId);
    taRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) doStop();
      else void doSend();
    }
  };

  const removeEntry = (i: number) =>
    apply.mutateAsync(entries.filter((_, idx) => idx !== i));

  const addEntries = (newOnes: Entry[]) =>
    apply.mutateAsync([...entries, ...newOnes]);

  return (
    <div className="composer">
      {overBudget && (
        <div className="composer-warning" role="status">
          Context exceeds {cap.toLocaleString()} token limit. Remove entries to
          continue.
        </div>
      )}
      <ContextChipRow
        entries={entries}
        frozenAt={frozenAt}
        onRemove={removeEntry}
        onAdd={() => setPickerOpen(true)}
      />
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder={
          isStreaming
            ? "Streaming response — press Stop or Enter to cancel"
            : "Ask anything…"
        }
        disabled={isStreaming}
        className="composer-input"
        rows={1}
      />
      <div className="composer-footer">
        <ContextBudgetPill
          threadId={threadId}
          onOpenModal={() => setPickerOpen(true)}
        />
        {isStreaming ? (
          <Button
            onClick={doStop}
            disabled={!canStop}
            className="composer-send is-stop"
            aria-label="Stop streaming"
            title="Stop streaming"
          >
            <Square size={12} fill="currentColor" />
          </Button>
        ) : (
          <Button
            onClick={() => { void doSend(); }}
            disabled={sendDisabled}
            className="composer-send"
            aria-label="Send"
            title="Send"
          >
            <Send size={14} />
          </Button>
        )}
      </div>
      <ContextPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAddEntries={addEntries}
      />
    </div>
  );
}
