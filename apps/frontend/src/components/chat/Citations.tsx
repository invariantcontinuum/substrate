import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Citation } from "@/hooks/useChatMessages";
import { useUIStore } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";

export function Citations({ items }: { items: Citation[] }) {
  const navigate = useNavigate();
  const openModal = useUIStore((s) => s.openModal);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const [open, setOpen] = useState<string | null>(null);

  if (items.length === 0) return null;

  const inspect = (nodeId: string) => {
    navigate("/graph");
    setSelectedNodeId(nodeId);
    openModal("nodeDetail");
  };

  return (
    <div className="ask-citations" role="list">
      {items.map((c) => {
        const isOpen = open === c.node_id;
        const hasSource = !!c.excerpt;
        return (
          <div key={c.node_id} role="listitem" className="ask-citation">
            <div className="ask-citation-row">
              <button
                type="button"
                className="ask-citation-chip"
                title={c.file_path || c.node_id}
                onClick={() =>
                  hasSource ? setOpen(isOpen ? null : c.node_id) : inspect(c.node_id)
                }
              >
                <span className="ask-citation-name">
                  {c.file_path || c.name || c.node_id}
                </span>
                {c.type && (
                  <span className="ask-citation-type">{c.type}</span>
                )}
                {hasSource && (
                  <span className="ask-citation-toggle" aria-hidden>
                    {isOpen ? "−" : "+"}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="ask-citation-inspect"
                onClick={() => inspect(c.node_id)}
                aria-label="Open node in graph"
                title="Open node in graph"
              >
                ↗
              </button>
            </div>
            {isOpen && hasSource && (
              <pre
                className="ask-citation-excerpt"
                data-language={c.language || ""}
              >
                <code>{c.excerpt}</code>
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
