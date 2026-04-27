/**
 * SourceSnapshotMultiSelect — tree-shaped picker that lets the user select
 * a mix of (whole-source) and (specific snapshot) entries in a single
 * control.
 *
 * Layout
 * ------
 *  ▸ owner/name          [□ Whole source]
 *      ▾ ▢ 2d ago — 2026-04-25 10:34   master @ abc1234   [completed]
 *        ▢ 5h ago — 2026-04-26 18:01   feature/x @ def…   [running]
 *
 * Selection model
 * ---------------
 *  Two parallel arrays travel through ``onChange``:
 *  - ``sync_ids``   — individual snapshots the user pinned. Server uses
 *    these verbatim at thread creation.
 *  - ``source_ids`` — sources the user wants "the latest snapshot of"
 *    on every new chat thread. Server resolves each id to its current
 *    ``last_sync_id`` at thread-creation time, so re-syncing a source
 *    silently advances the chat scope.
 *
 *  The source-row checkbox toggles membership in ``source_ids`` only.
 *  The snapshot checkboxes toggle membership in ``sync_ids`` only. The
 *  visual tri-state on the parent reflects: ``all`` if the source is in
 *  ``source_ids``; ``partial`` if any of its snapshots are in
 *  ``sync_ids``; ``none`` otherwise.
 *
 * Data
 * ----
 *  - ``useSources()`` provides the source list (fast, cached at 5min).
 *  - ``useSourceSyncs(sourceId)`` paginates per-source sync_runs. We
 *    render the first 25-page; expanding further is "Load more". This
 *    matches the existing snapshot-list UX in SourcesSnapshotsTab.
 *
 * Styling — every class is namespaced ``snapshot-multiselect-*`` so it
 * does not collide with the existing snapshot-card / snapshot-row
 * rules. CSS lives in styles/globals.css under "SourceSnapshotMultiSelect".
 */
import { useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useSources, type Source } from "@/hooks/useSources";
import { useSourceSyncs } from "@/hooks/useSourceSyncs";
import type { SyncRun } from "@/hooks/useSyncs";

export interface SnapshotEntry {
  id: string;
  completed_at: string | null;
  ref: string | null;
  status: string;
}

export interface SourceSnapshotSelection {
  sync_ids:   string[];
  source_ids: string[];
}

export interface SourceSnapshotMultiSelectProps {
  /** Controlled snapshot ids (specific snapshots the user pinned). */
  syncIds: string[];
  /** Controlled source ids ("always use the latest snapshot"). */
  sourceIds: string[];
  /** Fires whenever either array changes. Always returns both. */
  onChange: (next: SourceSnapshotSelection) => void;
  /** When true, disable rows whose status != 'completed'. */
  completedOnly?: boolean;
  /** Optional: restrict to these source ids. Default: all sources. */
  visibleSourceIds?: string[];
  /** Optional className for the root. */
  className?: string;
}

type TriState = "none" | "partial" | "all";

function classifySource(
  sourceId: string,
  snapshotIds: string[],
  selectedSyncs: Set<string>,
  selectedSources: Set<string>,
): TriState {
  // "Whole source" is the strongest selector: when the source itself is
  // pinned the row reads "all" regardless of which snapshots are in
  // sync_ids — picking a specific snapshot in addition would just be
  // redundant on the wire.
  if (selectedSources.has(sourceId)) return "all";
  if (snapshotIds.length === 0) return "none";
  let hits = 0;
  for (const id of snapshotIds) if (selectedSyncs.has(id)) hits += 1;
  if (hits === 0) return "none";
  return "partial";
}

function fmtAbsolute(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // YYYY-MM-DD HH:MM
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function fmtRef(ref: string | null): string {
  if (!ref) return "—";
  // Common form: "<branch>@<sha>" or just a sha; trim long shas to 7 chars.
  if (ref.includes("@")) {
    const [branch, sha] = ref.split("@", 2);
    return sha ? `${branch} @ ${sha.trim().slice(0, 7)}` : branch;
  }
  if (/^[0-9a-f]{40}$/i.test(ref)) return ref.slice(0, 7);
  return ref;
}

interface CheckboxProps {
  state: TriState | "checked" | "unchecked";
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel: string;
}

function TriCheckbox({ state, disabled, onClick, ariaLabel }: CheckboxProps) {
  const checked =
    state === "all" || state === "checked"
      ? true
      : state === "partial"
        ? "mixed"
        : false;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`snapshot-multiselect-checkbox snapshot-multiselect-checkbox-${state}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick?.();
      }}
    >
      <span className="snapshot-multiselect-checkbox-glyph" aria-hidden>
        {state === "partial" ? "–" : state === "all" || state === "checked" ? "✓" : ""}
      </span>
    </button>
  );
}

interface SourceNodeProps {
  source: Source;
  selectedSyncs: Set<string>;
  selectedSources: Set<string>;
  onToggleSnapshot: (id: string) => void;
  onToggleWholeSource: (sourceId: string) => void;
  completedOnly: boolean;
  expandedDefault?: boolean;
}

function SourceNode({
  source,
  selectedSyncs,
  selectedSources,
  onToggleSnapshot,
  onToggleWholeSource,
  completedOnly,
  expandedDefault = false,
}: SourceNodeProps) {
  const [expanded, setExpanded] = useState(expandedDefault);
  // Fetch the first page eagerly (regardless of expansion) so the
  // collapsed source row knows whether any of its snapshots are in the
  // current selection — without it the tri-state checkbox always read
  // "none" until the user opened the accordion.
  const sourceSyncs = useSourceSyncs(source.id);
  const items: SyncRun[] = sourceSyncs.items;

  const eligibleIds = useMemo(
    () =>
      items
        .filter((r) => (completedOnly ? r.status === "completed" : true))
        .map((r) => r.id),
    [items, completedOnly],
  );

  const triState = classifySource(
    source.id,
    eligibleIds,
    selectedSyncs,
    selectedSources,
  );
  const wholeSourcePinned = selectedSources.has(source.id);
  const selectedCountInSource = items.filter(
    (r) => selectedSyncs.has(r.id),
  ).length;

  const toggleExpand = () => setExpanded((v) => !v);

  const ariaLabelSource = `Toggle whole source ${source.owner}/${source.name}`;

  return (
    <div className="snapshot-multiselect-source">
      <div
        className={`snapshot-multiselect-source-row${expanded ? " is-expanded" : ""}`}
      >
        <button
          type="button"
          className="snapshot-multiselect-disclosure"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={toggleExpand}
        >
          {expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
        <TriCheckbox
          state={triState}
          disabled={sourceSyncs.isLoading}
          onClick={() => onToggleWholeSource(source.id)}
          ariaLabel={ariaLabelSource}
        />
        <button
          type="button"
          className="snapshot-multiselect-source-label"
          onClick={toggleExpand}
        >
          <span className="snapshot-multiselect-source-name">
            {source.owner}/{source.name}
          </span>
          {wholeSourcePinned ? (
            <span className="snapshot-multiselect-source-count">
              whole source
            </span>
          ) : selectedCountInSource > 0 ? (
            <span className="snapshot-multiselect-source-count">
              {selectedCountInSource} selected
            </span>
          ) : null}
        </button>
      </div>

      {expanded && (
        <div className="snapshot-multiselect-snapshots">
          {sourceSyncs.isLoading ? (
            <SnapshotSkeleton rows={3} />
          ) : items.length === 0 ? (
            <div className="snapshot-multiselect-empty">
              <em>No snapshots yet — sync this source to create one.</em>
            </div>
          ) : (
            <>
              {items.map((run) => {
                const disabled =
                  (completedOnly && run.status !== "completed") ||
                  wholeSourcePinned;
                const isSelected = wholeSourcePinned || selectedSyncs.has(run.id);
                return (
                  <div
                    key={run.id}
                    className={`snapshot-multiselect-snapshot${
                      disabled ? " is-disabled" : ""
                    }${isSelected ? " is-selected" : ""}`}
                  >
                    <TriCheckbox
                      state={isSelected ? "checked" : "unchecked"}
                      disabled={disabled}
                      onClick={() => onToggleSnapshot(run.id)}
                      ariaLabel={`Toggle snapshot ${run.id.slice(0, 8)}`}
                    />
                    <button
                      type="button"
                      className="snapshot-multiselect-snapshot-body"
                      disabled={disabled}
                      onClick={() => !disabled && onToggleSnapshot(run.id)}
                    >
                      <span
                        className="snapshot-multiselect-snapshot-time"
                        title={fmtAbsolute(run.completed_at ?? run.created_at)}
                      >
                        {fmtRelative(run.completed_at ?? run.created_at)}
                        <span className="snapshot-multiselect-snapshot-time-abs">
                          {" — "}
                          {fmtAbsolute(run.completed_at ?? run.created_at)}
                        </span>
                      </span>
                      <span className="snapshot-multiselect-snapshot-ref">
                        {fmtRef(run.ref)}
                      </span>
                      <span
                        className={`snapshot-multiselect-snapshot-status snapshot-multiselect-status-${run.status}`}
                      >
                        {run.status}
                      </span>
                    </button>
                  </div>
                );
              })}
              {sourceSyncs.hasNextPage && (
                <button
                  type="button"
                  className="snapshot-multiselect-load-more"
                  onClick={() => sourceSyncs.fetchNextPage()}
                  disabled={sourceSyncs.isFetching}
                >
                  {sourceSyncs.isFetching ? (
                    <>
                      <RefreshCw
                        size={12}
                        className="snapshot-multiselect-spinner"
                      />
                      Loading…
                    </>
                  ) : (
                    "Load more snapshots"
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SnapshotSkeleton({ rows, style }: { rows: number; style?: CSSProperties }) {
  return (
    <div className="snapshot-multiselect-skeleton" style={style}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="snapshot-multiselect-skeleton-row" />
      ))}
    </div>
  );
}

export function SourceSnapshotMultiSelect(
  props: SourceSnapshotMultiSelectProps,
) {
  const {
    syncIds,
    sourceIds,
    onChange,
    completedOnly = false,
    visibleSourceIds,
    className,
  } = props;
  const { sources, isLoading } = useSources();

  const visibleSources = useMemo(() => {
    if (!sources) return [];
    if (!visibleSourceIds || visibleSourceIds.length === 0) return sources;
    const allowed = new Set(visibleSourceIds);
    return sources.filter((s) => allowed.has(s.id));
  }, [sources, visibleSourceIds]);

  const selectedSyncs = useMemo(() => new Set(syncIds), [syncIds]);
  const selectedSources = useMemo(() => new Set(sourceIds), [sourceIds]);

  const toggleSnapshot = (id: string) => {
    const next = new Set(selectedSyncs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({
      sync_ids: Array.from(next),
      source_ids: Array.from(selectedSources),
    });
  };

  const toggleWholeSource = (sourceId: string) => {
    const nextSources = new Set(selectedSources);
    const nextSyncs = new Set(selectedSyncs);
    if (nextSources.has(sourceId)) {
      nextSources.delete(sourceId);
    } else {
      // Pinning a whole source supersedes any specific snapshots from
      // the same source — drop them so the wire payload stays minimal
      // and the UI reads as "this source is all-pinned, no fragments".
      nextSources.add(sourceId);
      const src = sources?.find((s) => s.id === sourceId);
      if (src?.last_sync_id && nextSyncs.has(src.last_sync_id)) {
        nextSyncs.delete(src.last_sync_id);
      }
    }
    onChange({
      sync_ids: Array.from(nextSyncs),
      source_ids: Array.from(nextSources),
    });
  };

  const rootClass = `snapshot-multiselect${className ? ` ${className}` : ""}`;

  if (isLoading) {
    return (
      <div className={rootClass}>
        <SnapshotSkeleton rows={4} />
      </div>
    );
  }

  if (visibleSources.length === 0) {
    return (
      <div className={rootClass}>
        <div className="snapshot-multiselect-empty">
          <em>No sources registered yet.</em>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass} role="tree" aria-label="Source and snapshot selector">
      {visibleSources.map((src) => (
        <SourceNode
          key={src.id}
          source={src}
          selectedSyncs={selectedSyncs}
          selectedSources={selectedSources}
          onToggleSnapshot={toggleSnapshot}
          onToggleWholeSource={toggleWholeSource}
          completedOnly={completedOnly}
        />
      ))}
    </div>
  );
}
