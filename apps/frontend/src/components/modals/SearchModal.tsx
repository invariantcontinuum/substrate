import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/stores/ui";
import { useGraphStore } from "@/stores/graph";
import { useSearch, type SearchHit } from "@/hooks/useSearch";

/**
 * Ctrl+K / Cmd+K global node search.
 *
 * Type to autocomplete; pick a result with mouse or Enter (highlights
 * the first hit). Selection:
 *   1. Routes to the matching carousel slide when ``community_index``
 *      is non-negative — the carousel reads its slot index from the URL
 *      ``/graph/c/<cacheKey>/<idx>``, so we just navigate there. Slot 0
 *      is "All", slot N+1 is "Other"; community indices map onto slots
 *      1..N in the same order ``CarouselEngine`` builds them.
 *   2. Calls ``focusNode`` on the graph store, which both selects the
 *      node id (driving the spotlight effect in GraphCanvas) and queues
 *      a one-shot zoom request consumed by the canvas effect added in
 *      Task 3.4.
 *
 * TODO(Task 3.5): when the slide-kind enum lands, swap the URL math
 * below for a lookup against ``carouselStore.slides[].kind`` so we can
 * route ``community_index === -1`` directly to the "Other" slide
 * regardless of how many communities the active set produced. For now
 * we conservatively only switch slides when the URL is already on the
 * /graph/c/<cacheKey>/<idx> shape and we can guess the right slot.
 */
export function SearchModal() {
  const navigate = useNavigate();
  const params = useParams<{ cacheKey?: string; idx?: string }>();
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const focusNode = useGraphStore((s) => s.focusNode);

  const [query, setQuery] = useState("");
  const { data, isFetching } = useSearch(query);
  const hits: SearchHit[] = data?.hits ?? [];

  const handleClose = () => {
    setQuery("");
    closeModal();
  };

  const handleSelect = (hit: SearchHit) => {
    // Slide switch: only attempt when the carousel URL is already in the
    // /graph/c/<cacheKey>/<idx> shape — otherwise we'd guess at a slot
    // index that doesn't exist yet. Slot 0 is "All", slot N+1 is "Other";
    // a non-negative community_index lines up with slot index+1 in the
    // order CarouselEngine emits.
    if (params.cacheKey) {
      const targetSlot = hit.community_index >= 0 ? hit.community_index + 1 : 0;
      navigate(`/graph/c/${params.cacheKey}/${targetSlot}`);
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
