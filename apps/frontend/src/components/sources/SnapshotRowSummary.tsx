import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import type { SyncRun } from "@/hooks/useSyncs";
import { useSyncSetStore } from "@/stores/syncSet";
import { useResyncSnapshot } from "@/hooks/useResyncSnapshot";
import { StatPill } from "@/components/common/StatPill";
import { CommunitySparkline } from "@/components/common/CommunitySparkline";

const PROGRESS_BAR_PHASES = new Set(["discovering", "parsing", "preparing", "graphing"]);

const PHASE_LABEL: Record<string, string> = {
  cloning: "Cloning repo",
  discovering: "Discovering files",
  parsing: "Parsing imports",
  preparing: "Preparing chunks",
  graphing: "Writing graph",
  embedding_summaries: "Embedding file summaries",
  embedding_chunks: "Embedding chunks",
  done: "Finalising",
};

interface Props {
  run: SyncRun;
  isSelected?: boolean;
  isExpanded: boolean;
  onToggleSelect?: () => void;
  onToggleExpand: () => void;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), rs = s % 60;
  return `${m}m ${rs}s`;
}

const numFmt = new Intl.NumberFormat("en-US");

export function SnapshotRowSummary({ run, isSelected, isExpanded, onToggleSelect, onToggleExpand }: Props) {
  const isRunning = run.status === "running";
  const isLoaded = useSyncSetStore((s) => s.syncIds.includes(run.id));
  const resync = useResyncSnapshot();
  const eligibleForResync =
    (run.status === "failed" || run.status === "cancelled") &&
    run.resume_cursor != null;
  const meta = run.progress_meta;
  const phase = meta?.phase ?? "";
  const phaseHasBar = PROGRESS_BAR_PHASES.has(phase);
  const phaseLabel = PHASE_LABEL[phase] ?? phase;

  const useChunkCounters =
    phase === "embedding_chunks" &&
    meta?.chunks_total != null &&
    meta.chunks_total > 0;
  const displayDone = useChunkCounters ? (meta?.chunks_embedded ?? 0) : run.progress_done;
  const displayTotal = useChunkCounters ? (meta?.chunks_total ?? 0) : run.progress_total;
  const pct = displayTotal > 0 ? Math.round((displayDone / displayTotal) * 100) : 0;

  const stats = (run.stats as never as { schema_version?: number; counts?: { node_count?: number; edge_count?: number }; leiden?: { count?: number; modularity?: number; community_sizes?: number[]; note?: string }; timing?: { total_ms?: number } }) ?? {};
  const unavailable = !stats.schema_version || stats.schema_version < 1;

  return (
    <div className={`snapshot-card ${isExpanded ? "is-expanded" : ""}`} data-status={run.status}>
      <div className="snapshot-card-identity">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select snapshot ${run.id.slice(0, 8)}`}
          />
        )}
        <span className={`chip chip-${run.status}`}>{run.status}</span>
        {isLoaded && <span className="loaded-dot" aria-label="loaded">●</span>}
        <span className="time">{formatRelative(run.completed_at ?? run.created_at)}</span>
        {stats.timing?.total_ms && <span className="duration">· {formatDuration(stats.timing.total_ms)}</span>}
        {eligibleForResync && (
          <button
            type="button"
            className="snapshot-row-resync"
            title="Resume sync from last successful batch"
            onClick={(e) => { e.stopPropagation(); resync.mutate(run.id); }}
            disabled={resync.isPending}
            aria-label="Resume sync"
          >
            <RotateCw size={12} />
          </button>
        )}
        <button className="expand-caret" onClick={onToggleExpand} aria-expanded={isExpanded} aria-label="Expand details">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>

      {isRunning ? (
        <div className="snapshot-row-progress">
          <span className="snapshot-row-progress-text">
            {phaseLabel || "Running"}
            {displayTotal > 0 && (
              <>
                {" · "}
                {displayDone} / {displayTotal}
              </>
            )}
            {phaseHasBar && ` · ${pct}%`}
          </span>
          <span className="snapshot-row-progress-bar">
            <span style={{ width: `${phaseHasBar ? pct : 100}%` }} className={phaseHasBar ? "" : "indeterminate"} />
          </span>
        </div>
      ) : unavailable ? (
        <div className="snapshot-card-unavailable muted">stats unavailable</div>
      ) : (
        <>
          <div className="snapshot-card-stats">
            <StatPill label="nodes" value={numFmt.format(stats.counts?.node_count ?? 0)} />
            <StatPill label="edges" value={numFmt.format(stats.counts?.edge_count ?? 0)} />
            <StatPill label="communities" value={stats.leiden?.count ?? 0} />
            <StatPill label="mod" value={(stats.leiden?.modularity ?? 0).toFixed(2)} />
          </div>
          <CommunitySparkline sizes={stats.leiden?.community_sizes} />
        </>
      )}
    </div>
  );
}
