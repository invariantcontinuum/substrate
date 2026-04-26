import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useSources, type Source } from "@/hooks/useSources";

function SourceSettingsCard({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
  const { updateSource } = useSources();

  const ret = (source.config?.retention ?? {}) as Record<string, unknown>;
  const [label, setLabel] = useState(source.name);
  const [enabled, setEnabled] = useState(source.enabled);
  const [ageDays, setAgeDays] = useState<string>(
    typeof ret.age_days === "number" ? String(ret.age_days) : "",
  );
  const [perCap, setPerCap] = useState<string>(
    typeof ret.per_source_cap === "number" ? String(ret.per_source_cap) : "",
  );
  const [neverPrune, setNeverPrune] = useState<boolean>(ret.never_prune === true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    if (!neverPrune) {
      if (ageDays !== "" && (isNaN(Number(ageDays)) || Number(ageDays) <= 0)) {
        setError("Age (days) must be positive."); return;
      }
      if (perCap !== "" && (isNaN(Number(perCap)) || Number(perCap) <= 0)) {
        setError("Per-source cap must be positive."); return;
      }
    }
    type PatchArgs = Parameters<typeof updateSource>[0];
    const patch: PatchArgs = { id: source.id };
    if (label !== source.name) patch.label = label;
    if (enabled !== source.enabled) patch.enabled = enabled;

    const origRetention = ret;
    const retentionPatch: Record<string, unknown> = {};
    if (neverPrune !== (origRetention.never_prune === true)) {
      retentionPatch.never_prune = neverPrune;
    }
    if (!neverPrune) {
      if (ageDays !== "" && Number(ageDays) !== Number(origRetention.age_days)) {
        retentionPatch.age_days = Number(ageDays);
      }
      if (perCap !== "" && Number(perCap) !== Number(origRetention.per_source_cap)) {
        retentionPatch.per_source_cap = Number(perCap);
      }
    }
    if (Object.keys(retentionPatch).length > 0) {
      patch.config = { retention: retentionPatch as never };
    }

    setSaving(true);
    try {
      await updateSource(patch);
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={`per-source-settings-card${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="per-source-settings-summary"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{source.owner}/{source.name}</span>
      </button>
      {open && (
        <div className="per-source-settings-body">
          <label>Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>URL
            <input value={source.url} readOnly disabled />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Enabled
          </label>
          <label>Age (days)
            <input
              type="number"
              min={1}
              placeholder="30 (default)"
              value={ageDays}
              onChange={(e) => setAgeDays(e.target.value)}
              disabled={neverPrune}
            />
          </label>
          <label>Per-source cap
            <input
              type="number"
              min={1}
              placeholder="10 (default)"
              value={perCap}
              onChange={(e) => setPerCap(e.target.value)}
              disabled={neverPrune}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={neverPrune}
              onChange={(e) => setNeverPrune(e.target.checked)}
            />
            Never prune
          </label>
          {error && <p className="config-error">{error}</p>}
          <div className="config-actions">
            <button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function PerSourceSettingsList() {
  const { sources } = useSources();
  if (!sources?.length) return <p className="muted">No sources to configure yet.</p>;
  return (
    <section className="per-source-settings-list">
      <h3>Per-source settings</h3>
      <ul>
        {sources.map((s) => <SourceSettingsCard key={s.id} source={s} />)}
      </ul>
    </section>
  );
}
