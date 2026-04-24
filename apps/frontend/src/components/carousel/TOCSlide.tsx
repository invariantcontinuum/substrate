import type { CommunityEntry, CommunitySummary } from "@/hooks/useCommunities";

interface Props {
  summary: CommunitySummary | null;
  communities: CommunityEntry[];
  onSelect: (index: number) => void;
}

/**
 * Slide 0 of the carousel — the table of contents.
 *
 * Each community gets a card with its label, size, and rank; clicking a
 * card navigates the engine to that community's slide. A summary pill
 * across the top surfaces the headline community count + modularity so
 * a user can read the graph's health at a glance before drilling in.
 */
export function TOCSlide({ summary, communities, onSelect }: Props) {
  return (
    <div className="carousel-slide toc-slide">
      <div className="toc-header">
        <h2>Communities</h2>
        {summary && (
          <div className="toc-summary">
            <span>{summary.community_count} groups</span>
            <span>·</span>
            <span>modularity {summary.modularity.toFixed(3)}</span>
            <span>·</span>
            <span>{Math.round(summary.orphan_pct * 100)}% orphans</span>
          </div>
        )}
      </div>
      <div className="toc-cards">
        {communities.map((c) => (
          <button
            key={c.index}
            type="button"
            className="toc-card"
            onClick={() => onSelect(c.index)}
          >
            <div className="toc-card-rank">#{c.index + 1}</div>
            <div className="toc-card-body">
              <div className="toc-card-label">{c.label}</div>
              <div className="toc-card-meta">
                {c.size} node{c.size === 1 ? "" : "s"}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
