/**
 * SourceSnapshotMultiSelect — tree-shaped picker that lets the user select
 * any combination of (source, snapshot) pairs in a single control.
 *
 * Layout
 * ------
 *  ▸ owner/name          [□ all] (loaded counter)
 *      ▾ ▢ 2d ago — 2026-04-25 10:34   master @ abc1234   [completed]
 *        ▢ 5h ago — 2026-04-26 18:01   feature/x @ def…   [running]
 *
 * Selection model
 * ---------------
 *  - `value`/`onChange` carry sync_ids (snapshots) only — the parent never
 *    has to track sources separately.
 *  - The source-row checkbox is purely a select-all-in-source helper:
 *    clicking it toggles every snapshot of that source between selected
 *    and unselected. The visual is `none | partial | all` based on what's
 *    in `value`.
 *
 * Data
 * ----
 *  - `useSources()` provides the source list (fast, cached at 5min).
 *  - `useSourceSyncs(sourceId)` paginates per-source sync_runs. We render
 *    the first 25-page; expanding further is "Load more". This matches the
 *    existing snapshot-list UX in SourcesSnapshotsTab.
 *
 * Styling — every class is namespaced `snapshot-multiselect-*` so it does
 * not collide with the existing snapshot-card / snapshot-row rules. CSS
 * lives in styles/globals.css under "SourceSnapshotMultiSelect".
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

export interface SourceSnapshotMultiSelectProps {
  /** Selected snapshot ids; controlled. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** When true, disable rows whose status != 'completed'. */
  completedOnly?: boolean;
  /** Optional: limit to these source ids. Default: all sources. */
  sourceIds?: string[];
  /** Optional className for the root. */
  className?: string;
}

type TriState = "none" | "partial" | "all";

function classifySource(snapshotIds: string[], selected: Set<string>): TriState {
  if (snapshotIds.length === 0) return "none";
  let hits = 0;
  for (const id of snapshotIds) if (selected.has(id)) hits += 1;
  if (hits === 0) return "none";
  if (hits === snapshotIds.length) return "all";
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
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  completedOnly: boolean;
  expandedDefault?: boolean;
}

function SourceNode({
  source,
  selected,
  onSelectionChange,
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

  const triState = classifySource(eligibleIds, selected);
  const selectedCountInSource = items.filter((r) => selected.has(r.id)).length;

  const toggleExpand = () => setExpanded((v) => !v);

  const toggleSourceAll = () => {
    if (eligibleIds.length === 0) return;
    const next = new Set(selected);
    if (triState === "all") {
      for (const id of eligibleIds) next.delete(id);
    } else {
      for (const id of eligibleIds) next.add(id);
    }
    onSelectionChange(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const ariaLabelSource = `Toggle all snapshots in ${source.owner}/${source.name}`;

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
          disabled={
            sourceSyncs.isLoading || (expanded && eligibleIds.length === 0)
          }
          onClick={toggleSourceAll}
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
          {selectedCountInSource > 0 && (
            <span className="snapshot-multiselect-source-count">
              {selectedCountInSource} selected
            </span>
          )}
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
                  completedOnly && run.status !== "completed";
                const isSelected = selected.has(run.id);
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
                      onClick={() => toggleOne(run.id)}
                      ariaLabel={`Toggle snapshot ${run.id.slice(0, 8)}`}
                    />
                    <button
                      type="button"
                      className="snapshot-multiselect-snapshot-body"
                      disabled={disabled}
                      onClick={() => !disabled && toggleOne(run.id)}
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
  const { value, onChange, completedOnly = false, sourceIds, className } = props;
  const { sources, isLoading } = useSources();

  const visibleSources = useMemo(() => {
    if (!sources) return [];
    if (!sourceIds || sourceIds.length === 0) return sources;
    const allowed = new Set(sourceIds);
    return sources.filter((s) => allowed.has(s.id));
  }, [sources, sourceIds]);

  const selected = useMemo(() => new Set(value), [value]);

  const setSelection = (next: Set<string>) => {
    onChange(Array.from(next));
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
          selected={selected}
          onSelectionChange={setSelection}
          completedOnly={completedOnly}
        />
      ))}
    </div>
  );
}
