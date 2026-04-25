import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatThreads } from "@/hooks/useChatThreads";
import { useCreateThread } from "@/hooks/useChatMutations";
import { useChatStore } from "@/stores/chat";
import { ThreadListItem } from "@/components/layout/ThreadListItem";

export function AskThreadRail() {
  const { data: threads, isLoading } = useChatThreads();
  const createThread = useCreateThread();
  const activeId = useChatStore((s) => s.activeThreadId);
  const setActiveId = useChatStore((s) => s.setActiveThreadId);

  const handleCreate = async () => {
    const created = await createThread.mutateAsync(undefined);
    setActiveId(created.id);
  };

  return (
    <aside className="chat-rail">
      <Button onClick={handleCreate} className="chat-new-btn" disabled={createThread.isPending}>
        <Plus size={14} /> New thread
      </Button>
      <div className="chat-thread-list">
        {isLoading && <Loader2 size={14} />}
        {threads?.map((t) => (
          <ThreadListItem
            key={t.id}
            thread={t}
            active={t.id === activeId}
            onSelect={() => setActiveId(t.id)}
          />
        ))}
      </div>
    </aside>
  );
}
