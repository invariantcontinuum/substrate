import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { AskThread } from "@/hooks/useAskThreads";
import { useRenameThread, useDeleteThread } from "@/hooks/useAskMutations";

interface Props {
  thread: AskThread;
  active: boolean;
  onSelect: () => void;
}

export function ThreadListItem({ thread, active, onSelect }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thread.title);
  const rename = useRenameThread();
  const remove = useDeleteThread();

  const commit = () => {
    const next = draft.trim() || thread.title;
    setEditing(false);
    if (next !== thread.title) {
      rename.mutate({ id: thread.id, title: next });
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { setEditing(false); setDraft(thread.title); }
  };

  return (
    <div className={`ask-thread-item${active ? " is-active" : ""}`}>
      {editing ? (
        <input
          autoFocus
          className="ask-thread-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
        />
      ) : (
        <button
          type="button"
          className="ask-thread-select"
          onClick={onSelect}
          onDoubleClick={() => { setDraft(thread.title); setEditing(true); }}
        >
          <span className="ask-thread-title">{thread.title}</span>
          {thread.last_message_preview && (
            <span className="ask-thread-preview">{thread.last_message_preview}</span>
          )}
        </button>
      )}
      <button
        type="button"
        className="ask-thread-delete"
        onClick={(e) => { e.stopPropagation(); remove.mutate(thread.id); }}
        aria-label="Delete thread"
      >
        <X size={12} />
      </button>
    </div>
  );
}
