import { LeidenKnob } from "@/components/common/LeidenKnob";
import { Row } from "@/components/common/Row";
import { CommunityHistogram } from "@/components/common/CommunityHistogram";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useCarouselStore, type LeidenConfig } from "@/stores/carousel";
import { usePrefsStore } from "@/stores/prefs";
import { useSyncSetStore } from "@/stores/syncSet";
import {
  useEffectiveConfig,
  useApplyConfig,
} from "@/hooks/useRuntimeConfig";
import { apiFetch } from "@/lib/api";
import { logger } from "@/lib/logger";

interface GraphConfig {
  per_sync_leiden_resolution?: number;
  per_sync_leiden_beta?: number;
  per_sync_leiden_iterations?: number;
  per_sync_leiden_min_cluster_size?: number;
  per_sync_leiden_seed?: number;
  layout?: string;
}

interface RecomputeResponse {
  cache_key: string;
  cached_at: string;
  expires_at: string;
  summary: {
    community_count: number;
    modularity: number;
    community_sizes: number[];
    orphan_pct: number;
  } | null;
  communities: { index: number; label: string; size: number }[];
  config_used: LeidenConfig | null;
}

function authToken(): string | undefined {
  return (window as Window & { __authToken?: string }).__authToken;
}

export function SettingsGraphTab() {
  const { config: graphCfg } = useEffectiveConfig<GraphConfig>("graph");
  const apply = useApplyConfig("graph");

  const staged = useCarouselStore((s) => s.stagedConfig);
  const active = useCarouselStore((s) => s.activeConfig);
  const setStaged = useCarouselStore((s) => s.setStaged);
  const drift = useCarouselStore((s) => s.drift);
  const summary = useCarouselStore((s) => s.summary);
  const cacheKey = useCarouselStore((s) => s.cacheKey);
  const expiresAt = useCarouselStore((s) => s.expiresAt);
  const setResult = useCarouselStore((s) => s.setResult);
  const discard = useCarouselStore((s) => s.discardStaged);
  const syncIds = useSyncSetStore((s) => s.syncIds);
  const prefsLeiden = usePrefsStore((s) => s.leiden);
  const setLeiden = usePrefsStore((s) => s.setLeiden);

  const driftCount = (Object.keys(active) as Array<keyof typeof active>).filter(
    (k) => active[k] !== staged[k],
  ).length;

  const onRecompute = async () => {
    const token = authToken();
    if (!token || syncIds.length === 0) return;
    try {
      const data = await apiFetch<RecomputeResponse>(
        "/api/communities/recompute",
        token,
        {
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
      // Persist the staged knobs into the user prefs so the graph-store's
      // subscriber refetches with the new config and rerenders against
      // the freshly-computed clusters. Mirrors SourcesConfigTab.
      if (data.config_used) setLeiden(data.config_used);
    } catch (err) {
      logger.warn("settings_graph_recompute_failed", { error: String(err) });
    }
  };

  const useDefaults = () => {
    for (const k of Object.keys(prefsLeiden) as Array<keyof typeof prefsLeiden>) {
      setStaged({ [k]: prefsLeiden[k] });
    }
  };

  return (
    <section className="settings-graph">
      <h3>Graph</h3>

      <SectionHeader
        title="Default Leiden"
        aux="applied to per-sync clustering"
      />
      <LeidenKnob
        label="Resolution"
        min={0.1}
        max={5}
        step={0.1}
        value={graphCfg.per_sync_leiden_resolution ?? 1.0}
        onChange={(v) => apply.mutate({ per_sync_leiden_resolution: v })}
      />
      <LeidenKnob
        label="Beta"
        min={0}
        max={0.1}
        step={0.005}
        value={graphCfg.per_sync_leiden_beta ?? 0.01}
        onChange={(v) => apply.mutate({ per_sync_leiden_beta: v })}
      />
      <LeidenKnob
        label="Iterations"
        min={1}
        max={50}
        step={1}
        value={graphCfg.per_sync_leiden_iterations ?? 10}
        onChange={(v) =>
          apply.mutate({ per_sync_leiden_iterations: Math.round(v) })
        }
      />
      <LeidenKnob
        label="Min cluster size"
        min={1}
        max={100}
        step={1}
        value={graphCfg.per_sync_leiden_min_cluster_size ?? 4}
        onChange={(v) =>
          apply.mutate({ per_sync_leiden_min_cluster_size: Math.round(v) })
        }
      />
      <LeidenKnob
        label="Seed"
        min={0}
        max={9999}
        step={1}
        value={graphCfg.per_sync_leiden_seed ?? 42}
        onChange={(v) => apply.mutate({ per_sync_leiden_seed: Math.round(v) })}
      />

      <SectionHeader
        title="Active-set Leiden"
        aux={`${syncIds.length} syncs loaded`}
      />
      <LeidenKnob
        label="Resolution"
        min={0.1}
        max={5}
        step={0.1}
        value={staged.resolution}
        onChange={(v) => setStaged({ resolution: v })}
      />
      <LeidenKnob
        label="Beta"
        min={0}
        max={0.1}
        step={0.005}
        value={staged.beta}
        onChange={(v) => setStaged({ beta: v })}
      />
      <LeidenKnob
        label="Iterations"
        min={1}
        max={50}
        step={1}
        value={staged.iterations}
        onChange={(v) => setStaged({ iterations: Math.round(v) })}
      />
      <LeidenKnob
        label="Min cluster size"
        min={1}
        max={100}
        step={1}
        value={staged.min_cluster_size}
        onChange={(v) => setStaged({ min_cluster_size: Math.round(v) })}
      />
      <LeidenKnob
        label="Seed (advanced)"
        min={0}
        max={9999}
        step={1}
        value={staged.seed}
        onChange={(v) => setStaged({ seed: Math.round(v) })}
      />
      <div className="config-actions">
        <button
          className="cta-primary"
          onClick={onRecompute}
          disabled={!drift || syncIds.length === 0}
        >
          {drift
            ? `Recompute (${driftCount} knob${driftCount === 1 ? "" : "s"} changed)`
            : "Recompute"}
        </button>
        <button className="cta-ghost" onClick={discard} disabled={!drift}>
          Discard changes
        </button>
        <button className="cta-ghost" onClick={useDefaults}>
          Use my defaults
        </button>
      </div>

      <SectionHeader title="Preview" aux="active-set result" />
      {summary ? (
        <div className="preview">
          <Row
            k="Current"
            v={`${summary.community_count} communities · mod ${summary.modularity.toFixed(2)}`}
          />
          <CommunityHistogram sizes={summary.community_sizes} />
          <Row k="Cache key" v={<code>{cacheKey?.slice(0, 12) ?? "—"}</code>} />
          <Row k="Expires" v={expiresAt ?? "—"} />
        </div>
      ) : (
        <div className="muted">No result yet. Load syncs on the Snapshots tab.</div>
      )}

      <SectionHeader title="Drift" />
      <Row
        k="Staged vs cached"
        v={
          drift ? (
            <span style={{ color: "#ffd197" }}>
              {driftCount} knob{driftCount === 1 ? "" : "s"} changed — Recompute to apply
            </span>
          ) : (
            <span style={{ color: "#a0f0c0" }}>in sync</span>
          )
        }
      />

      <SectionHeader title="Layout" />
      <select
        value={graphCfg.layout ?? "force-directed"}
        onChange={(e) => apply.mutate({ layout: e.target.value })}
      >
        <option value="force-directed">Force-directed</option>
        <option value="hierarchical">Hierarchical</option>
      </select>
    </section>
  );
}
