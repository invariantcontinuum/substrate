import type { Citation } from "@/hooks/useAskMessages";
import { useUIStore } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";

export function CitationChips({ items }: { items: Citation[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const openModal = useUIStore((s) => s.openModal);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);

  if (items.length === 0) return null;

  const open = (nodeId: string) => {
    setActiveView("graph");
    setSelectedNodeId(nodeId);
    openModal("nodeDetail");
  };

  return (
    <div className="ask-citations" role="list">
      {items.map((c) => (
        <button
          key={c.node_id}
          type="button"
          role="listitem"
          className="ask-citation-chip"
          onClick={() => open(c.node_id)}
          title={c.node_id}
        >
          <span className="ask-citation-name">{c.name || c.node_id}</span>
          {c.type && <span className="ask-citation-type">{c.type}</span>}
        </button>
      ))}
    </div>
  );
}
