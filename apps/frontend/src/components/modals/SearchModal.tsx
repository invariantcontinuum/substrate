import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";
import { useSearch, type SearchHit } from "@/hooks/useSearch";
import { useCarouselSlides } from "@/hooks/useCarouselSlides";

/**
 * Ctrl+K / Cmd+K global node search.
 *
 * Type to autocomplete; pick a result with mouse or Enter (highlights
 * the first hit). Selection:
 *   1. Routes to the matching carousel slide. Phase 3.5 dropped the
 *      legacy "All" slide, so the slide list is just
 *      ``[community_0, …, community_N-1, other?]`` in the order
 *      ``CarouselEngine`` emits. We look the hit's ``community_index``
 *      up against the live slide list (via ``useCarouselSlides``) so
 *      ``community_index === -1`` lands on the "Other" slide regardless
 *      of how many communities the active set produced.
 *   2. Calls ``focusNode`` on the graph store, which both selects the
 *      node id (driving the spotlight effect in GraphCanvas) and queues
 *      a one-shot zoom request consumed by the canvas effect added in
 *      Task 3.4.
 */
export function SearchModal() {
  const navigate = useNavigate();
  const params = useParams<{ cacheKey?: string; idx?: string }>();
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const focusNode = useGraphStore((s) => s.focusNode);
  const { slides, cacheKey } = useCarouselSlides();

  const [query, setQuery] = useState("");
  const { data, isFetching } = useSearch(query);
  const hits: SearchHit[] = data?.hits ?? [];

  // Build a community-index → slot-index map once so search routing is
  // O(1) per click. The "Other" slide (kind === "other") gets reached
  // through a sentinel -1 community_index, so its slot is also stored.
  const slotByCommunityIndex = useMemo(() => {
    const m = new Map<number, number>();
    slides.forEach((s, i) => {
      if (s.kind === "community") m.set(s.index, i);
      else m.set(-1, i);
    });
    return m;
  }, [slides]);

  const handleClose = () => {
    setQuery("");
    closeModal();
  };

  const handleSelect = (hit: SearchHit) => {
    // Slide switch: prefer the live slide list when we have it; fall
    // back to the URL only if the carousel hasn't computed yet.
    const targetCacheKey = cacheKey ?? params.cacheKey ?? null;
    if (targetCacheKey) {
      const slot =
        slotByCommunityIndex.get(hit.community_index) ??
        slotByCommunityIndex.get(-1) ??
        0;
      navigate(`/graph/c/${targetCacheKey}/${slot}`);
    }
    focusNode(hit.node_id);
    handleClose();
  };

  return (
    <Modal
      open={activeModal === "search"}
      onClose={handleClose}
      title="Search"
      maxWidth={560}
    >
      <div className="search-modal">
        <div className="search-modal-row">
          <Input
            type="text"
            placeholder="Search nodes by name or path…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits.length > 0) {
                e.preventDefault();
                handleSelect(hits[0]);
              }
            }}
            autoFocus
          />
          <span className="search-modal-status" aria-hidden>
            {isFetching ? <Loader2 size={14} /> : <Search size={14} />}
          </span>
        </div>

        {hits.length > 0 && (
          <div className="search-modal-results">
            {hits.map((hit) => (
              <button
                key={hit.node_id}
                type="button"
                onClick={() => handleSelect(hit)}
                className="search-result-item"
              >
                <div className="search-result-header">
                  <span className="search-result-name">{hit.name}</span>
                  {hit.type && <Badge>{hit.type}</Badge>}
                  {hit.community_index >= 0 && (
                    <Badge>community {hit.community_index}</Badge>
                  )}
                </div>
                <div className="search-result-desc">{hit.filepath}</div>
                <div className="search-result-id">{hit.node_id}</div>
              </button>
            ))}
          </div>
        )}

        {query.trim().length > 0 && !isFetching && hits.length === 0 && (
          <div className="search-modal-results">
            <div className="search-result-desc">No matches.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
