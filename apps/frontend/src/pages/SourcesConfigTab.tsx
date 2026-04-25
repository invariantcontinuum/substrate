import { SectionHeader } from "@/components/common/SectionHeader";
import { LeidenKnob } from "@/components/common/LeidenKnob";
import { Row } from "@/components/common/Row";
import { CommunityHistogram } from "@/components/common/CommunityHistogram";
import { ChatContextBlock } from "@/components/sources/ChatContextBlock";
import { PerSourceSettingsList } from "@/components/sources/PerSourceSettingsList";
import { useCarouselStore } from "@/stores/carousel";
import { usePrefsStore } from "@/stores/prefs";
import { useSyncSetStore } from "@/stores/syncSet";
import { apiFetch } from "@/lib/api";

export function SourcesConfigTab() {
  const staged = useCarouselStore((s) => s.stagedConfig);
  const active = useCarouselStore((s) => s.activeConfig);
  const drift = useCarouselStore((s) => s.drift);
  const setStaged = useCarouselStore((s) => s.setStaged);
  const discard = useCarouselStore((s) => s.discardStaged);
  const setResult = useCarouselStore((s) => s.setResult);
  const summary = useCarouselStore((s) => s.summary);
  const cacheKey = useCarouselStore((s) => s.cacheKey);
  const expiresAt = useCarouselStore((s) => s.expiresAt);
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const prefsLeiden = usePrefsStore((s) => s.leiden);

  const driftCount = (Object.keys(active) as (keyof typeof active)[])
    .filter((k) => active[k] !== staged[k]).length;

  const onRecompute = async () => {
    const token = (window as Window & { __authToken?: string }).__authToken;
    if (!token || syncIds.length === 0) return;
    const data = await apiFetch<{
      cache_key: string;
      cached_at: string;
      expires_at: string;
      summary: typeof summary;
      communities: { index: number; label: string; size: number }[];
      config_used: typeof staged;
    }>(
      `/api/graph/communities/recompute`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync_ids: syncIds, config: staged }),
      },
    );
    setResult({
      cacheKey: data.cache_key,
      cachedAt: data.cached_at,
      expiresAt: data.expires_at,
      summary: data.summary,
      communities: data.communities,
      labels: Object.fromEntries(data.communities.map((c) => [c.index, c.label])),
      configUsed: data.config_used,
      orphanPct: data.summary?.orphan_pct ?? 0,
    });
  };

  return (
    <div className="config-tab">
      <SectionHeader title="Active-set Leiden" aux={`${syncIds.length} syncs loaded`} />
      <LeidenKnob label="Resolution" min={0.1} max={5} step={0.1} value={staged.resolution}
                  onChange={(v) => setStaged({ resolution: v })} />
      <LeidenKnob label="Beta (randomness)" min={0} max={0.1} step={0.005} value={staged.beta}
                  onChange={(v) => setStaged({ beta: v })} />
      <LeidenKnob label="Iterations" min={1} max={50} step={1} value={staged.iterations}
                  onChange={(v) => setStaged({ iterations: Math.round(v) })} />
      <LeidenKnob label="Min cluster size" min={1} max={100} step={1} value={staged.min_cluster_size}
                  onChange={(v) => setStaged({ min_cluster_size: Math.round(v) })} />
      <LeidenKnob label="Seed (advanced)" min={0} max={9999} step={1} value={staged.seed}
                  onChange={(v) => setStaged({ seed: Math.round(v) })} />
      <div className="config-actions">
        <button className="cta-primary" onClick={onRecompute} disabled={!drift || syncIds.length === 0}>
          {drift ? `Recompute (${driftCount} knob${driftCount === 1 ? "" : "s"} changed)` : "Recompute"}
        </button>
        <button className="cta-ghost" onClick={discard} disabled={!drift}>Discard changes</button>
        <button className="cta-ghost" onClick={() => { for (const k of Object.keys(prefsLeiden) as (keyof typeof prefsLeiden)[]) setStaged({ [k]: prefsLeiden[k] }); }}>
          Use my defaults
        </button>
      </div>

      <SectionHeader title="Preview" aux="active-set result" />
      {summary ? (
        <div className="preview">
          <Row k="Current" v={`${summary.community_count} communities · mod ${summary.modularity.toFixed(2)}`} />
          <CommunityHistogram sizes={summary.community_sizes} />
          <Row k="Cache key" v={<code>{cacheKey?.slice(0, 12) ?? "—"}</code>} />
          <Row k="Expires" v={expiresAt ?? "—"} />
        </div>
      ) : <div className="muted">No result yet. Load syncs on the Snapshots tab.</div>}

      <SectionHeader title="Drift" />
      <Row k="Staged vs cached"
           v={drift
             ? <span style={{ color: "#ffd197" }}>{driftCount} knob{driftCount === 1 ? "" : "s"} changed — Recompute to apply</span>
             : <span style={{ color: "#a0f0c0" }}>in sync</span>}
      />

      <ChatContextBlock />
      <PerSourceSettingsList />
    </div>
  );
}
