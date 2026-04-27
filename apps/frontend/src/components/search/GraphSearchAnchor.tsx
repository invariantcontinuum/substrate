import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { GraphSearchDropdown } from "./GraphSearchDropdown";

/**
 * Header search button + its anchored dropdown.
 *
 * Owns the open/close state for the dropdown so the GraphPage header
 * just renders this component on the right edge. Subscribes to the
 * UI store's ``graphSearchOpenSeq`` so the global Ctrl+K handler can
 * pop the dropdown without an imperative ref hop.
 */
export function GraphSearchAnchor() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const seq = useUIStore((s) => s.graphSearchOpenSeq);
  const [prevSeq, setPrevSeq] = useState(seq);

  // Bump-driven open: every Ctrl+K press increments the sequence so we
  // open even if the user just closed the dropdown a moment ago.
  // Uses the "prev-prop in state" pattern to avoid setState-in-effect.
  if (prevSeq !== seq) {
    setPrevSeq(seq);
    if (seq > 0 && !open) setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn-ghost graph-header-search-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search nodes (Ctrl+K)"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Search nodes (Ctrl+K)"
      >
        <Search size={14} /> Search
      </button>
      <GraphSearchDropdown
        anchor={buttonRef}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
