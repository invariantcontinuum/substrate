import { useAskThreads } from "@/hooks/useAskThreads";
import { useAskStore } from "@/stores/ask";
import { AskChatHeader } from "./AskChatHeader";
import { AskMessageList } from "./AskMessageList";
import { AskComposer } from "./AskComposer";

export function AskChatPane() {
  const activeId = useAskStore((s) => s.activeThreadId);
  const { data: threads } = useAskThreads();
  const thread = threads?.find((t) => t.id === activeId) ?? null;
  return (
    <section className="ask-chat">
      <AskChatHeader thread={thread} />
      <AskMessageList threadId={activeId} />
      <AskComposer threadId={activeId} />
    </section>
  );
}
