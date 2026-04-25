import { useState } from "react";
import { useChatThreads } from "@/hooks/useChatThreads";
import { useChatStore } from "@/stores/chat";
import { AskChatHeader } from "./AskChatHeader";
import { AskMessageList } from "./AskMessageList";
import { AskComposer } from "./AskComposer";
import { ContextBudgetPill } from "./ContextBudgetPill";
import { ContextFilesModal } from "./ContextFilesModal";

export function AskChatPane() {
  const activeId = useChatStore((s) => s.activeThreadId);
  const { data: threads } = useChatThreads();
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
