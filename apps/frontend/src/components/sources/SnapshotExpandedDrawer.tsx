import { SectionHeader } from "@/components/common/SectionHeader";
import { StatBox } from "@/components/common/StatBox";
import { StatPill } from "@/components/common/StatPill";
import { CommunityHistogram } from "@/components/common/CommunityHistogram";
import { PhaseStrip } from "@/components/common/PhaseStrip";
import { useSnapshotDelta } from "@/hooks/useSnapshotDelta";
import type { SyncRun } from "@/hooks/useSyncs";

const numFmt = new Intl.NumberFormat("en-US");
const bytesFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

interface Props {
  run: SyncRun;
}

function n(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

export function SnapshotExpandedDrawer({ run }: Props) {
  const stats = rec(run.stats);
  const counts = rec(stats.counts);
  const storage = rec(stats.storage);
  const embeddings = rec(stats.embeddings);
  const timing = rec(stats.timing);
  const leiden = rec(stats.leiden);
  const issues = rec(stats.issues);
  const { data: delta } = useSnapshotDelta(run.id);

  const byType = rec(counts.by_type);
  const byRel = rec(counts.by_relation);

  return (
    <div className="snapshot-drawer">
      <SectionHeader title="Counts & breakdown" />
      <div className="stats-grid-4">
        <StatBox label="Files indexed" value={n(counts.files_indexed)} />
        <StatBox label="Skipped" value={n(counts.files_skipped)} />
        <StatBox label="Denied" value={n(counts.files_denied)} />
        <StatBox label="Chunks" value={n(embeddings.chunks)} />
      </div>
      <div className="pill-row">
        {Object.entries(byType).map(([k, v]) => (
          <StatPill key={k} label={k} value={numFmt.format(n(v))} />
        ))}
      </div>
      <div className="pill-row">
        {Object.entries(byRel).map(([k, v]) => (
          <StatPill key={k} label={k} value={numFmt.format(n(v))} />
        ))}
      </div>

      <SectionHeader
        title="Communities"
        aux={leiden.config_used ? `config r=${n(rec(leiden.config_used).resolution)}` : undefined}
      />
      <div className="stats-grid-4">
        <StatBox label="Count" value={n(leiden.count)} />
        <StatBox label="Modularity" value={n(leiden.modularity).toFixed(2)} />
        <StatBox label="Largest" value={`${Math.round(n(leiden.largest_share) * 100)}%`} />
        <StatBox label="Orphan" value={`${Math.round(n(leiden.orphan_pct) * 100)}%`} />
      </div>
      <CommunityHistogram sizes={Array.isArray(leiden.community_sizes) ? leiden.community_sizes as number[] : undefined} />

      <SectionHeader title="Storage" />
      <div className="stats-grid-3">
        <StatBox label="Graph" value={bytesFmt.format(n(storage.graph_bytes)) + " B"} />
        <StatBox label="Embeddings" value={bytesFmt.format(n(storage.embedding_bytes)) + " B"} />
        <StatBox label="Total" value={bytesFmt.format(n(storage.graph_bytes) + n(storage.embedding_bytes)) + " B"} />
      </div>

      <SectionHeader title="Timing" aux={n(timing.total_ms) ? `${numFmt.format(n(timing.total_ms))} ms total` : undefined} />
      <PhaseStrip phases={rec(timing.phase_ms) as Record<string, number>} />

      <SectionHeader title="Delta vs previous" />
      {!delta?.delta ? (
        <div className="muted">no prior snapshot</div>
      ) : (
        <div className="pill-row">
          <StatPill label="nodes" value={signed(delta.delta.node_count)} />
          <StatPill label="edges" value={signed(delta.delta.edge_count)} />
          <StatPill label="communities" value={signed(delta.delta.community_count)} />
          <StatPill label="mod Δ" value={delta.delta.modularity.toFixed(2)} />
          <StatPill label="files" value={signed(delta.delta.files_indexed)} />
          <StatPill label="storage" value={`${bytesFmt.format(delta.delta.storage_bytes)} B`} />
        </div>
      )}

      <SectionHeader title="Issues" />
      <div className="pill-row">
        <StatPill label="errors" value={n(issues.error_count)} />
        <StatPill label="warnings" value={n(issues.warning_count)} />
        <StatPill label="info" value={n(issues.info_count)} />
      </div>
    </div>
  );
}

function signed(v: number): string {
  if (v > 0) return `+${v.toLocaleString()}`;
  if (v < 0) return v.toLocaleString();
  return "0";
}
