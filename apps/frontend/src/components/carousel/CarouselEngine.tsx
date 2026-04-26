import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useGraphStore } from "@/stores/graph";
import { useSyncSetStore } from "@/stores/syncSet";
import { useExportCommunity } from "@/hooks/useExportCommunity";
import { useCarouselSlides } from "@/hooks/useCarouselSlides";

/**
 * The carousel REPLACES the single-canvas Graph view. A single GraphCanvas
 * instance stays mounted at page level; the engine writes to
 * ``useGraphStore.setVisibleSubset`` to scope it per slide:
 *
 *   slot 0..N-1     one Leiden community each (subset = its node_ids)
 *   slot N (last)   "Other" — every node that DIDN'T land in a community
 *
 * The UI chrome is a bottom strip only (prev/next + dot rail + current
 * slide label). Nothing floats over the canvas — the graph is the page.
 */
export function CarouselEngine() {
  const navigate = useNavigate();
  const params = useParams<{ cacheKey?: string; idx?: string }>();
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const setVisibleSubset = useGraphStore((s) => s.setVisibleSubset);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const exportComm = useExportCommunity();

  const { slides, cacheKey, loading, error } = useCarouselSlides();

  const totalSlides = slides.length;
  const rawIdx = Number.parseInt(params.idx ?? "0", 10);
  const slotIdx = Number.isFinite(rawIdx)
    ? Math.max(0, Math.min(rawIdx, Math.max(0, totalSlides - 1)))
    : 0;
  const currentSlide = slides[slotIdx];

  // Apply the visibility filter whenever the slide changes. The effect
  // also clears any selected node so spotlight state from the previous
  // slide doesn't bleed into the new one. Cleanup on unmount restores
  // the full canvas for other consumers (e.g. the Sources page active-
  // set pill reuses the same mounted cytoscape).
  useEffect(() => {
    if (!currentSlide) {
      setVisibleSubset(null);
      return;
    }
    setVisibleSubset(currentSlide.nodeIds);
    // Slide change deselects: a node selected on the previous slide
    // is no longer in the visible subset, so its spotlight + node-
    // detail pulse would be misleading. Clear the selection so the
    // new slide opens clean.
    setSelectedNodeId(null);
    return () => {
      setVisibleSubset(null);
    };
  }, [currentSlide, setVisibleSubset, setSelectedNodeId]);

  // Rebase the URL onto a fresh cache_key whenever one arrives, so
  // sharing the URL reproduces the same slide for another viewer.
  const lastCacheKey = useRef<string | null>(null);
  useEffect(() => {
    if (!cacheKey) return;
    if (lastCacheKey.current === cacheKey) return;
    lastCacheKey.current = cacheKey;
    if (params.cacheKey !== cacheKey) {
      navigate(`/graph/c/${cacheKey}/${slotIdx}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const goTo = (next: number) => {
    if (!cacheKey) return;
    const clamped = Math.max(0, Math.min(totalSlides - 1, next));
    navigate(`/graph/c/${cacheKey}/${clamped}`);
  };

  // Keyboard nav. Home → slide 0, ←/→ → step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cacheKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") goTo(slotIdx + 1);
      else if (e.key === "ArrowLeft") goTo(slotIdx - 1);
      else if (e.key === "Home") goTo(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, slotIdx, totalSlides]);

  if (syncIds.length === 0) {
    return (
      <div className="carousel-strip is-empty">
        Load a snapshot from Sources to see its communities.
      </div>
    );
  }
  if (!cacheKey && loading) {
    return <div className="carousel-strip is-empty">Computing communities…</div>;
  }
  if (!cacheKey && error) {
    return <div className="carousel-strip is-empty">Compute failed</div>;
  }
  if (!cacheKey) {
    return null;
  }
  if (totalSlides === 0) {
    return (
      <div className="carousel-strip is-empty">
        Run sync to detect communities
      </div>
    );
  }

  const label =
    currentSlide?.kind === "other"
      ? `Other · ${currentSlide.size} node${
          currentSlide.size === 1 ? "" : "s"
        }`
      : currentSlide
        ? `${currentSlide.label} · ${currentSlide.size} node${
            currentSlide.size === 1 ? "" : "s"
          }`
        : "";

  return (
    <div className="carousel-strip">
      <button
        type="button"
        className="carousel-step"
        onClick={() => goTo(slotIdx - 1)}
        disabled={slotIdx === 0}
        aria-label="Previous slide"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="carousel-body">
        <div className="carousel-label-row">
          <div className="carousel-label">{label}</div>
          {currentSlide && currentSlide.kind === "community" && (
            <button
              type="button"
              className="carousel-slide-download"
              title="Export this slide as JSON"
              aria-label="Export this slide"
              onClick={() => {
                if (cacheKey) {
                  void exportComm(cacheKey, currentSlide.index).catch(
                    console.error,
                  );
                }
              }}
            >
              <Download size={11} />
            </button>
          )}
        </div>
        <nav
          className="carousel-rail"
          aria-label="Community slides"
          role="tablist"
        >
          {slides.map((s, i) => (
            <button
              key={`${s.kind}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === slotIdx}
              className={`carousel-dot${i === slotIdx ? " active" : ""}${s.kind === "other" ? " is-other" : ""}`}
              onClick={() => goTo(i)}
              title={s.label}
            >
              <span className="sr-only">{s.label}</span>
            </button>
          ))}
        </nav>
        <div className="carousel-count">
          {slotIdx + 1} / {totalSlides}
        </div>
      </div>
      <button
        type="button"
        className="carousel-step"
        onClick={() => goTo(slotIdx + 1)}
        disabled={slotIdx >= totalSlides - 1}
        aria-label="Next slide"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
