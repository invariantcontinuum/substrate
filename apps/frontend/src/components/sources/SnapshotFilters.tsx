import { useSources } from "@/hooks/useSources";

export interface SnapshotFilterState {
  sourceIds: Set<string>;
  status: string | null;
  loadedOnly: boolean;
}

interface Props {
  filters: SnapshotFilterState;
  onChange: (next: SnapshotFilterState) => void;
}

export function SnapshotFilters({ filters, onChange }: Props) {
  const { sources } = useSources();
  const toggleSource = (id: string) => {
    const next = new Set(filters.sourceIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ ...filters, sourceIds: next });
  };
  return (
    <div className="snapshot-filters">
      <select value={filters.status ?? ""} onChange={(e) => onChange({ ...filters, status: e.target.value || null })}>
        <option value="">any status</option>
        <option value="completed">completed</option>
        <option value="running">running</option>
        <option value="failed">failed</option>
        <option value="cleaned">cleaned</option>
      </select>
      <label className="ck">
        <input type="checkbox" checked={filters.loadedOnly}
               onChange={(e) => onChange({ ...filters, loadedOnly: e.target.checked })} />
        loaded only
      </label>
      <div className="filter-chips">
        {sources?.map((s) => (
          <button key={s.id}
            className={`filter-chip ${filters.sourceIds.has(s.id) ? "active" : ""}`}
            onClick={() => toggleSource(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
