// frontend/src/components/sources/SnapshotRowSummary.tsx
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import type { SyncRun } from "@/hooks/useSyncs";
import { useSyncSetStore } from "@/stores/syncSet";

// Phases where progress_done/progress_total meaningfully measure % complete.
// After "graphing" finishes the per-file chunking loop, progress_done hits its
// ceiling (= total files) while the sync is still doing AGE writes + embedding.
// Showing "100%" during those phases is misleading — we switch to a phase
// label + spinner instead.
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
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}

function formatTs(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function statusChip(status: string) {
  const cls = `snapshot-row-chip status-${status}`;
  return <span className={cls}>{status}</span>;
}

export function SnapshotRowSummary({ run, isSelected, isExpanded, onToggleSelect, onToggleExpand }: Props) {
  const isRunning = run.status === "running";
  const isLoaded = useSyncSetStore((s) => s.syncIds.includes(run.id));
  const meta = run.progress_meta;
  const phase = meta?.phase ?? "";
  const phaseHasBar = PROGRESS_BAR_PHASES.has(phase);
  const phaseLabel = PHASE_LABEL[phase] ?? phase;

  // During "embedding_chunks" the file-level counters pin at 100% because
  // the chunker already stamped `progress_done = len(nodes)` earlier. The
  // live work happens in `meta.chunks_embedded / meta.chunks_total`, so
  // we prefer those when present. Same logic would apply to
  // "embedding_summaries", but there ingestion updates progress_done via
  // `meta.files_embedded` so the file-level counters are accurate.
  const useChunkCounters =
    phase === "embedding_chunks" &&
    meta?.chunks_total != null &&
    meta.chunks_total > 0;
  const displayDone = useChunkCounters ? (meta?.chunks_embedded ?? 0) : run.progress_done;
  const displayTotal = useChunkCounters ? (meta?.chunks_total ?? 0) : run.progress_total;
  const pct = displayTotal > 0 ? Math.round((displayDone / displayTotal) * 100) : 0;

  return (
    <div className={`snapshot-row-summary${isExpanded ? " is-expanded" : ""}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggleSelect(); }}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select snapshot ${run.id.slice(0, 8)}`}
      />
      <button
        type="button"
        className="snapshot-row-body"
        onClick={onToggleExpand}
      >
        <span className="snapshot-row-ts">{formatTs(run.completed_at ?? run.created_at)}</span>
        {statusChip(run.status)}
        {isLoaded && (
          <Eye
            size={14}
            className="snapshot-row-loaded-icon"
            aria-label="Loaded on graph"
          />
        )}
        {isRunning && (
          <span className="snapshot-row-progress">
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
          </span>
        )}
        {(isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </button>
    </div>
  );
}
