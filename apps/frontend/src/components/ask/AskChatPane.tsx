import { useState } from "react";
import { useAskThreads } from "@/hooks/useAskThreads";
import { useAskStore } from "@/stores/ask";
import { AskChatHeader } from "./AskChatHeader";
import { AskMessageList } from "./AskMessageList";
import { AskComposer } from "./AskComposer";
import { ContextBudgetPill } from "./ContextBudgetPill";
import { ContextFilesModal } from "./ContextFilesModal";

export function AskChatPane() {
  const activeId = useAskStore((s) => s.activeThreadId);
  const { data: threads } = useAskThreads();
  const thread = threads?.find((t) => t.id === activeId) ?? null;
  const [ctxOpen, setCtxOpen] = useState(false);
  return (
    <section className="ask-chat">
      <AskChatHeader thread={thread} />
      <AskMessageList threadId={activeId} />
      <ContextBudgetPill threadId={activeId} onOpenModal={() => setCtxOpen(true)} />
      <AskComposer threadId={activeId} />
      {activeId && (
        <ContextFilesModal
          threadId={activeId}
          isOpen={ctxOpen}
          onClose={() => setCtxOpen(false)}
        />
      )}
    </section>
  );
}
