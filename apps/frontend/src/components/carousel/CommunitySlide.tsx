import type { CommunityEntry } from "@/hooks/useCommunities";

interface Props {
  community: CommunityEntry;
  total: number;
  /** Current slot index among community slides (0-based). */
  position: number;
  onAsk: (nodeIds: string[]) => void;
  onOpenNode: (nodeId: string) => void;
}

/**
 * A single community slide — header with community label + size, a list
 * of its top-N node ids (from the summary sample), and an Ask CTA that
 * opens the Ask thread pre-scoped to this cluster.
 *
 * The actual canvas render is intentionally NOT in this component —
 * cytoscape lives outside the slide DOM and receives a visibility
 * filter keyed on community index. This keeps slide transitions pure
 * React state + a camera pan, never a remount.
 */
export function CommunitySlide({
  community,
  total,
  position,
  onAsk,
  onOpenNode,
}: Props) {
  return (
    <div className="carousel-slide community-slide">
      <header className="community-slide-head">
        <div className="community-slide-rank">
          {position + 1} / {total}
        </div>
        <h2 className="community-slide-label">{community.label}</h2>
        <div className="community-slide-meta">
          {community.size} node{community.size === 1 ? "" : "s"}
        </div>
      </header>
      <div className="community-slide-body">
        <ul className="community-slide-nodes">
          {community.node_ids_sample.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="community-slide-node"
                onClick={() => onOpenNode(id)}
              >
                <code>{id.slice(0, 8)}</code>
              </button>
            </li>
          ))}
          {community.node_ids_sample.length < community.size && (
            <li className="community-slide-more">
              +{community.size - community.node_ids_sample.length} more
            </li>
          )}
        </ul>
      </div>
      <footer className="community-slide-foot">
        <button
          type="button"
          className="cta-ghost"
          onClick={() => onAsk(community.node_ids_sample)}
        >
          Ask about this cluster →
        </button>
      </footer>
    </div>
  );
}
