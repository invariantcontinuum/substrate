import type { ChatThread } from "@/hooks/useChatThreads";
import { ThreadListItem } from "./ThreadListItem";

interface Props {
  label: string;
  threads: ChatThread[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ThreadGroup({ label, threads, activeId, onSelect }: Props) {
  if (threads.length === 0) return null;
  return (
    <div className="thread-group">
      <h4 className="thread-group-label">{label}</h4>
      <ul className="thread-group-list">
        {threads.map((t) => (
          <ThreadListItem
            key={t.id}
            thread={t}
            active={t.id === activeId}
            onSelect={() => onSelect(t.id)}
          />
        ))}
      </ul>
    </div>
  );
}
