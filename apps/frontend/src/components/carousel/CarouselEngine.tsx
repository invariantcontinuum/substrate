import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCommunities } from "@/hooks/useCommunities";
import { usePrefsStore } from "@/stores/prefs";
import { useSyncSetStore } from "@/stores/syncSet";
import { TOCSlide } from "./TOCSlide";
import { CommunitySlide } from "./CommunitySlide";

/**
 * Slide registry + navigation for the per-community carousel.
 *
 * Slot 0 is the TOC/legend; slots 1..N are per-community slides in
 * descending size order; slot N+1 (if orphans exist) pools every
 * unclustered node. Route parameters ``:cacheKey/:idx`` keep the current
 * slide deep-linkable; a navigation that lands on a stale cache key
 * silently falls back to the TOC while the fresh result materialises.
 *
 * Keyboard shortcuts: ← / → to page; Home to TOC.
 */
export function CarouselEngine() {
  const navigate = useNavigate();
  const params = useParams<{ cacheKey?: string; idx?: string }>();
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const prefsLeiden = usePrefsStore((s) => s.leiden);
  const hydrated = usePrefsStore((s) => s.hydrated);
  const { data, loading, error } = useCommunities(
    syncIds,
    hydrated ? prefsLeiden : null,
  );

  const totalSlides = data ? 1 + data.communities.length : 1;
  const rawIdx = Number.parseInt(params.idx ?? "0", 10);
  const slotIdx = Number.isFinite(rawIdx)
    ? Math.max(0, Math.min(rawIdx, totalSlides - 1))
    : 0;

  // Keep the URL honest — once a fresh cache_key arrives, rebase the
  // route onto it so refreshes and shared links stay stable.
  useEffect(() => {
    if (!data) return;
    if (params.cacheKey !== data.cache_key) {
      navigate(`/graph/c/${data.cache_key}/${slotIdx}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.cache_key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!data) return;
      if (e.key === "ArrowRight") {
        const next = Math.min(totalSlides - 1, slotIdx + 1);
        navigate(`/graph/c/${data.cache_key}/${next}`);
      } else if (e.key === "ArrowLeft") {
        const prev = Math.max(0, slotIdx - 1);
        navigate(`/graph/c/${data.cache_key}/${prev}`);
      } else if (e.key === "Home") {
        navigate(`/graph/c/${data.cache_key}/0`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, slotIdx, totalSlides, navigate]);

  const selectCommunity = (communityIdx: number) => {
    if (!data) return;
    navigate(`/graph/c/${data.cache_key}/${communityIdx + 1}`);
  };

  const openNode = (nodeId: string) => {
    navigate(`/graph?node=${encodeURIComponent(nodeId)}`);
  };

  const askCluster = (nodeIds: string[]) => {
    const qs = new URLSearchParams({ scope: nodeIds.join(",") });
    navigate(`/ask?${qs.toString()}`);
  };

  if (syncIds.length === 0) {
    return (
      <div className="carousel-empty">
        Load at least one snapshot in the Sources tab to see its communities.
      </div>
    );
  }
  if (loading && !data) {
    return <div className="carousel-empty">Computing communities…</div>;
  }
  if (error && !data) {
    return <div className="carousel-empty">Compute failed: {error}</div>;
  }
  if (!data) {
    return <div className="carousel-empty">No community data yet.</div>;
  }

  return (
    <div className="carousel-engine">
      <div className="carousel-viewport">
        {slotIdx === 0 ? (
          <TOCSlide
            summary={data.summary}
            communities={data.communities}
            onSelect={selectCommunity}
          />
        ) : (
          <CommunitySlide
            community={data.communities[slotIdx - 1]}
            total={data.communities.length}
            position={slotIdx - 1}
            onAsk={askCluster}
            onOpenNode={openNode}
          />
        )}
      </div>
      <nav className="carousel-rail" aria-label="Community slides">
        <button
          type="button"
          className={`carousel-dot${slotIdx === 0 ? " active" : ""}`}
          onClick={() => navigate(`/graph/c/${data.cache_key}/0`)}
          aria-label="Table of contents"
        >
          ·
        </button>
        {data.communities.map((c, i) => (
          <button
            key={c.index}
            type="button"
            className={`carousel-dot${slotIdx === i + 1 ? " active" : ""}`}
            onClick={() =>
              navigate(`/graph/c/${data.cache_key}/${i + 1}`)
            }
            aria-label={`Community ${c.label}`}
          >
            ·
          </button>
        ))}
      </nav>
    </div>
  );
}
