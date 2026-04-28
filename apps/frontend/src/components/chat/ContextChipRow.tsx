import type { Entry } from "@/types/chat";

const ICON: Record<Entry["type"], string> = {
  source:            "🗂",
  snapshot:          "🕒",
  directory:         "📁",
  file:              "📄",
  community:         "🧩",
  node_neighborhood: "🕸",
};

function chipLabel(e: Entry): string {
  switch (e.type) {
    case "source":    return e.source_id.slice(0, 8);
    case "snapshot":  return e.sync_id.slice(0, 8);
    case "directory": return e.prefix.replace(/\/$/, "") || "/";
    case "file":      return e.file_id.slice(0, 8);
    case "community": return `c-${e.community_index}`;
    case "node_neighborhood":
      return `${e.node_id.slice(0, 8)} +${e.depth}h`;
  }
}

export interface ContextChipRowProps {
  entries:  Entry[];
  frozenAt: string | null;
  onRemove: (index: number) => void;
  onAdd:    () => void;
}

export function ContextChipRow({ entries, frozenAt, onRemove, onAdd }: ContextChipRowProps) {
  const editable = frozenAt === null;
  return (
    <ul className="context-chip-row" role="list">
      {entries.map((e, i) => (
        <li key={`${e.type}-${i}`} className="context-chip" role="listitem">
          <span aria-hidden>{ICON[e.type]}</span>
          <span className="context-chip-label">{chipLabel(e)}</span>
          {editable && (
            <button
              aria-label="Remove chip"
              className="context-chip-remove"
              onClick={() => onRemove(i)}
            >×</button>
          )}
        </li>
      ))}
      {editable && (
        <li role="none">
          <button aria-label="Add context" className="context-chip-add" onClick={onAdd}>
            +
          </button>
        </li>
      )}
    </ul>
  );
}
