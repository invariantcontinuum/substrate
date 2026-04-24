import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAssignments } from "@/hooks/useAssignments";
import { useCommunities } from "@/hooks/useCommunities";
import { useGraphStore } from "@/stores/graph";
import { usePrefsStore } from "@/stores/prefs";
import { useSyncSetStore } from "@/stores/syncSet";

/**
 * The carousel REPLACES the single-canvas Graph view. A single GraphCanvas
 * instance stays mounted at page level; the engine writes to
 * ``useGraphStore.setVisibleSubset`` to scope it per slide:
 *
 *   slot 0          → full merged graph (subset = null)
 *   slot 1..N       → one Leiden community each (subset = its node_ids)
 *   slot N+1        → orphans: every node that DIDN'T land in a community
 *
 * The UI chrome is a bottom strip only (prev/next + dot rail + current
 * slide label). Nothing floats over the canvas — the graph is the page.
 */
export function CarouselEngine() {
  const navigate = useNavigate();
  const params = useParams<{ cacheKey?: string; idx?: string }>();
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const prefsLeiden = usePrefsStore((s) => s.leiden);
  const hydrated = usePrefsStore((s) => s.hydrated);
  const setVisibleSubset = useGraphStore((s) => s.setVisibleSubset);
  const allNodes = useGraphStore((s) => s.nodes);

  const { data, loading, error } = useCommunities(
    syncIds,
    hydrated ? prefsLeiden : null,
  );
  const { assignments } = useAssignments(data?.cache_key ?? null);

  // Precompute slide buckets. Slot 0 is the full-graph view; slots 1..N
  // are communities in the order the server returned; slot N+1 exists
  // iff at least one node in the graph isn't assigned to any community.
  //
  // ID-space caveat: assignments are keyed by ``file_embeddings.id`` UUIDs
  // (the ``file_id`` the backend emits), while cytoscape identifies nodes
  // by the synthetic ``src_<source_uuid>:<file_path>`` strings from
  // ``/api/graph`` (SlimNode.id). Each SlimNode carries its UUID on
  // ``.uuid``. We build a UUID→synthetic map once and translate every
  // bucket into cytoscape's address space so the canvas visibility
  // filter actually matches the nodes it knows about.
  const slides = useMemo(() => {
    if (!data) return [] as Array<
      | { kind: "full"; label: string }
      | { kind: "community"; label: string; index: number; size: number;
          ids: Set<string> }
      | { kind: "orphans"; label: string; ids: Set<string> }
    >;
    const uuidToCanvasId = new Map<string, string>();
    for (const n of allNodes) {
      if (n.uuid) uuidToCanvasId.set(n.uuid, n.id);
    }
    const toCanvasId = (uuid: string): string | undefined =>
      uuidToCanvasId.get(uuid);

    const out: Array<
      | { kind: "full"; label: string }
      | { kind: "community"; label: string; index: number; size: number;
          ids: Set<string> }
      | { kind: "orphans"; label: string; ids: Set<string> }
    > = [
      { kind: "full", label: "All communities" },
    ];

    // Group assigned UUIDs by community index once; fall back to the
    // summary-response sample when the NDJSON stream hasn't yet arrived
    // so the canvas has *something* to filter on immediately. Values in
    // each bucket are already translated to cytoscape synthetic ids.
    const byCommunity = new Map<number, Set<string>>();
    const clusteredCanvasIds = new Set<string>();
    for (const [uuid, cidx] of assignments.entries()) {
      if (cidx < 0) continue;
      const canvasId = toCanvasId(uuid);
      if (!canvasId) continue;
      let bucket = byCommunity.get(cidx);
      if (!bucket) {
        bucket = new Set();
        byCommunity.set(cidx, bucket);
      }
      bucket.add(canvasId);
      clusteredCanvasIds.add(canvasId);
    }
    for (const entry of data.communities) {
      const streamed = byCommunity.get(entry.index);
      let ids: Set<string>;
      if (streamed && streamed.size > 0) {
        ids = streamed;
      } else {
        ids = new Set();
        for (const uuid of entry.node_ids_sample) {
          const canvasId = toCanvasId(uuid);
          if (canvasId) {
            ids.add(canvasId);
            clusteredCanvasIds.add(canvasId);
          }
        }
      }
      out.push({
        kind: "community",
        label: entry.label,
        index: entry.index,
        size: entry.size,
        ids,
      });
    }

    // Orphan slot — nodes that aren't in any surviving community. Derived
    // from whatever the canvas has loaded, minus every clustered id,
    // both in the canvas (synthetic) id space.
    const orphans = new Set<string>();
    for (const n of allNodes) {
      if (!clusteredCanvasIds.has(n.id)) orphans.add(n.id);
    }
    if (orphans.size > 0) {
      out.push({ kind: "orphans", label: "Other", ids: orphans });
    }
    return out;
  }, [data, assignments, allNodes]);

  const totalSlides = slides.length;
  const rawIdx = Number.parseInt(params.idx ?? "0", 10);
  const slotIdx = Number.isFinite(rawIdx)
    ? Math.max(0, Math.min(rawIdx, Math.max(0, totalSlides - 1)))
    : 0;
  const currentSlide = slides[slotIdx];

  // Apply the visibility filter whenever the slide changes. The effect
  // clears on unmount so navigating away from /graph restores the full
  // canvas for other consumers (e.g. the Sources page active-set pill
  // reuses the same mounted cytoscape).
  useEffect(() => {
    if (!currentSlide) {
      setVisibleSubset(null);
      return;
    }
    if (currentSlide.kind === "full") {
      setVisibleSubset(null);
    } else {
      setVisibleSubset(currentSlide.ids);
    }
    return () => {
      setVisibleSubset(null);
    };
  }, [currentSlide, setVisibleSubset]);

  // Rebase the URL onto a fresh cache_key whenever one arrives, so
  // sharing the URL reproduces the same slide for another viewer.
  const lastCacheKey = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (lastCacheKey.current === data.cache_key) return;
    lastCacheKey.current = data.cache_key;
    if (params.cacheKey !== data.cache_key) {
      navigate(`/graph/c/${data.cache_key}/${slotIdx}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.cache_key]);

  const goTo = (next: number) => {
    if (!data) return;
    const clamped = Math.max(0, Math.min(totalSlides - 1, next));
    navigate(`/graph/c/${data.cache_key}/${clamped}`);
  };

  // Keyboard nav. Home → slide 0, ←/→ → step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!data) return;
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
  }, [data, slotIdx, totalSlides]);

  if (syncIds.length === 0) {
    return (
      <div className="carousel-strip is-empty">
        Load a snapshot from Sources to see its communities.
      </div>
    );
  }
  if (!data && loading) {
    return <div className="carousel-strip is-empty">Computing communities…</div>;
  }
  if (!data && error) {
    return <div className="carousel-strip is-empty">Compute failed</div>;
  }
  if (!data || totalSlides === 0) {
    return null;
  }

  const label =
    currentSlide?.kind === "full"
      ? `All · ${data.summary.community_count} groups`
      : currentSlide?.kind === "orphans"
        ? `Other · ${currentSlide.ids.size} node${
            currentSlide.ids.size === 1 ? "" : "s"
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
        <div className="carousel-label">{label}</div>
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
              className={`carousel-dot${i === slotIdx ? " active" : ""}${s.kind === "full" ? " is-full" : ""}${s.kind === "orphans" ? " is-orphan" : ""}`}
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
