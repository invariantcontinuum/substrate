import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useSearch, type SearchHit } from "@/hooks/useSearch";
import { useCarouselSlides } from "@/hooks/useCarouselSlides";

interface Props {
  /** Element the dropdown anchors below (the trigger button). */
  anchor: HTMLElement | null;
  /** Whether the dropdown is open. */
  open: boolean;
  /** Close the dropdown. */
  onClose: () => void;
}

/**
 * Header-anchored node search popover.
 *
 * Replaces the centred ``SearchModal``. Anchored beneath the trigger
 * button via fixed positioning + getBoundingClientRect, so it follows
 * the button on scroll/resize without needing a portal layer manager.
 *
 * Selection mirrors the previous modal flow: route to the matching
 * carousel slide for the hit's community, then ``focusNode()`` to
 * spotlight + zoom in the canvas. Closes on Escape, click-away, or
 * after a successful selection.
 */
export function GraphSearchDropdown({ anchor, open, onClose }: Props) {
  const navigate = useNavigate();
  const params = useParams<{ cacheKey?: string; idx?: string }>();
  const focusNode = useGraphStore((s) => s.focusNode);
  const { slides, cacheKey } = useCarouselSlides();

  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const { data, isFetching } = useSearch(query);
  const hits: SearchHit[] = data?.hits ?? [];

  // Build a community-index → slot-index map once so search routing
  // is O(1) per click. The "Other" slide reaches via -1.
  const slotByCommunityIndex = useMemo(() => {
    const m = new Map<number, number>();
    slides.forEach((s, i) => {
      if (s.kind === "community") m.set(s.index, i);
      else m.set(-1, i);
    });
    return m;
  }, [slides]);

  // Reset state on open and autofocus the input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    // requestAnimationFrame so focus happens after the popover mounts
    // and the layout has settled.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Clamp highlight as hits change.
  useEffect(() => {
    if (highlight >= hits.length) setHighlight(0);
  }, [hits.length, highlight]);

  // Click-away — close when a click lands outside both the popover
  // and the anchor button (so clicks on the trigger don't fight the
  // toggle on the anchor itself).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open, anchor, onClose]);

  // Escape closes — installed on capture so it wins over input handlers.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  // Compute fixed-position offset from the trigger's client rect.
  // Re-measured on open + on scroll/resize so the popover sticks below
  // the button if the layout shifts (responsive header, sidebar toggle).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!open || !anchor) {
      setPos(null);
      return;
    }
    const measure = () => {
      const r = anchor.getBoundingClientRect();
      const popWidth = 360;
      // Prefer right-aligning the popover with the trigger so it
      // doesn't overflow the right edge of the page on narrow widths.
      const left = Math.max(8, r.right - popWidth);
      const top = r.bottom + 6;
      setPos({ top, left });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, anchor]);

  const handleSelect = (hit: SearchHit) => {
    const targetCacheKey = cacheKey ?? params.cacheKey ?? null;
    if (targetCacheKey) {
      const slot =
        slotByCommunityIndex.get(hit.community_index) ??
        slotByCommunityIndex.get(-1) ??
        0;
      navigate(`/graph/c/${targetCacheKey}/${slot}`);
    }
    focusNode(hit.node_id);
    onClose();
  };

  if (!open || !pos) return null;

  return (
    <div
      ref={popoverRef}
      className="graph-search-dropdown"
      role="dialog"
      aria-label="Search nodes"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="graph-search-dropdown__row">
        <span className="graph-search-dropdown__icon" aria-hidden>
          {isFetching ? <Loader2 size={14} /> : <Search size={14} />}
        </span>
        <input
          ref={inputRef}
          type="text"
          className="graph-search-dropdown__input"
          placeholder="Search nodes by name or path…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(hits.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const target = hits[highlight] ?? hits[0];
              if (target) handleSelect(target);
            }
          }}
        />
      </div>

      <div className="graph-search-dropdown__list" role="listbox">
        {hits.length > 0 &&
          hits.map((hit, i) => (
            <button
              key={hit.node_id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className={`graph-search-dropdown__item${
                i === highlight ? " is-highlighted" : ""
              }`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => handleSelect(hit)}
            >
              <div className="graph-search-dropdown__item-title">
                <span className="graph-search-dropdown__item-name">
                  {hit.name}
                </span>
                {hit.type && (
                  <span className="graph-search-dropdown__chip">
                    {hit.type}
                  </span>
                )}
                {hit.community_index >= 0 && (
                  <span className="graph-search-dropdown__chip">
                    c{hit.community_index}
                  </span>
                )}
              </div>
              <div className="graph-search-dropdown__item-path">
                {hit.filepath}
              </div>
            </button>
          ))}

        {query.trim().length > 0 && !isFetching && hits.length === 0 && (
          <div className="graph-search-dropdown__empty">No matches.</div>
        )}

        {query.trim().length === 0 && (
          <div className="graph-search-dropdown__empty">
            Start typing to search nodes.
          </div>
        )}
      </div>
    </div>
  );
}
