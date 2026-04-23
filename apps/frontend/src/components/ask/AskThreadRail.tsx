import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAskThreads } from "@/hooks/useAskThreads";
import { useCreateThread } from "@/hooks/useAskMutations";
import { useAskStore } from "@/stores/ask";
import { ThreadListItem } from "./ThreadListItem";

export function AskThreadRail() {
  const { data: threads, isLoading } = useAskThreads();
  const createThread = useCreateThread();
  const activeId = useAskStore((s) => s.activeThreadId);
  const setActiveId = useAskStore((s) => s.setActiveThreadId);

  const handleCreate = async () => {
    const created = await createThread.mutateAsync(undefined);
    setActiveId(created.id);
  };

  return (
    <aside className="ask-rail">
      <Button onClick={handleCreate} className="ask-new-btn" disabled={createThread.isPending}>
        <Plus size={14} /> New thread
      </Button>
      <div className="ask-thread-list">
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
