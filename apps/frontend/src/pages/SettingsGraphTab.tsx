import { useState } from "react";
import { LeidenKnob } from "@/components/common/LeidenKnob";
import { Row } from "@/components/common/Row";
import { CommunityHistogram } from "@/components/common/CommunityHistogram";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SourceSnapshotMultiSelect } from "@/components/select/SourceSnapshotMultiSelect";
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
  const storeSyncIds = useSyncSetStore((s) => s.syncIds);
  // Re-mount the inner editor when the global active set identity changes
  // so the local draft re-seeds without an effect-driven setState.
  const seedKey = storeSyncIds.slice().sort().join(",");
  return <GraphSettingsEditor key={seedKey || "empty"} seed={storeSyncIds} />;
}

interface EditorProps {
  seed: string[];
}

function GraphSettingsEditor({ seed }: EditorProps) {
  const { config: graphCfg } = useEffectiveConfig<GraphConfig>("graph");
  const apply = useApplyConfig("graph");

  const setActiveSet = useSyncSetStore((s) => s.setActiveSet);
  const staged = useCarouselStore((s) => s.stagedConfig);
  const active = useCarouselStore((s) => s.activeConfig);
  const setStaged = useCarouselStore((s) => s.setStaged);
  const drift = useCarouselStore((s) => s.drift);
  const summary = useCarouselStore((s) => s.summary);
  const cacheKey = useCarouselStore((s) => s.cacheKey);
  const expiresAt = useCarouselStore((s) => s.expiresAt);
  const setResult = useCarouselStore((s) => s.setResult);
  const discard = useCarouselStore((s) => s.discardStaged);
  const prefsLeiden = usePrefsStore((s) => s.leiden);
  const setLeiden = usePrefsStore((s) => s.setLeiden);

  // Single source of truth for which (source, snapshot) pairs feed the
  // recompute / preview / drift sections on this tab. Seeded from the
  // global active-set store; "Apply selection" pushes the local choice
  // back into the store so the canvas + carousel re-render against it.
  const [selectedSyncIds, setSelectedSyncIds] = useState<string[]>(seed);
  const selectionDirty = !arraysEqual(selectedSyncIds, seed);

  // Preview/drift sections below read selectedSyncIds directly so they
  // always reflect the local draft until the user explicitly applies it
  // via "Apply selection" or "Recompute".

  const driftCount = (Object.keys(active) as Array<keyof typeof active>).filter(
    (k) => active[k] !== staged[k],
  ).length;

  const onApplySelection = () => {
    setActiveSet(selectedSyncIds);
  };

  const onRecompute = async () => {
    const token = authToken();
    if (!token || selectedSyncIds.length === 0) return;
    try {
      const data = await apiFetch<RecomputeResponse>(
        "/api/communities/recompute",
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sync_ids: selectedSyncIds, config: staged }),
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
      // the freshly-computed clusters.
      if (data.config_used) setLeiden(data.config_used);
      // Apply the selection to the global active set so the on-screen
      // graph + carousel reflect the just-recomputed cache_key.
      setActiveSet(selectedSyncIds);
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
        title="Active selection"
        aux={`${selectedSyncIds.length} snapshot${selectedSyncIds.length === 1 ? "" : "s"} selected`}
      />
      <SourceSnapshotMultiSelect
        value={selectedSyncIds}
        onChange={setSelectedSyncIds}
        completedOnly
      />
      <div className="config-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={onApplySelection}
          disabled={!selectionDirty}
        >
          Apply selection to graph
        </button>
      </div>

      <SectionHeader
        title="Leiden"
        aux={`${selectedSyncIds.length} snapshot${selectedSyncIds.length === 1 ? "" : "s"} selected`}
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
          className="btn-primary"
          onClick={onRecompute}
          disabled={selectedSyncIds.length === 0}
        >
          {drift
            ? `Recompute (${driftCount} knob${driftCount === 1 ? "" : "s"} changed)`
            : "Recompute"}
        </button>
        <button className="btn-ghost" onClick={discard} disabled={!drift}>
          Discard changes
        </button>
        <button className="btn-ghost" onClick={useDefaults}>
          Use my defaults
        </button>
      </div>

      <SectionHeader title="Preview" aux="active-set result" />
      {selectedSyncIds.length === 0 ? (
        <div className="muted">
          Select one or more snapshots above to preview Leiden communities.
        </div>
      ) : summary ? (
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
        <div className="muted">No result yet — click Recompute to run.</div>
      )}

      <SectionHeader title="Drift" />
      <Row
        k="Selection vs applied"
        v={
          selectionDirty ? (
            <span style={{ color: "#ffd197" }}>
              Selection changed — Apply or Recompute to update graph
            </span>
          ) : (
            <span style={{ color: "#a0f0c0" }}>in sync</span>
          )
        }
      />
      <Row
        k="Knobs vs cached"
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

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  for (const x of a) if (!setB.has(x)) return false;
  return true;
}
