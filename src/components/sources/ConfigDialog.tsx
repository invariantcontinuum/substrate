// ConfigDialog — per-source configuration dialog.
// Opens from UnifiedToolbar's Config button when exactly one source is selected.
// Two sections (both visible, no tabs):
//   1. Metadata: editable label (persisted as name), readonly URL, enabled toggle.
//   2. Retention overrides: age_days, per_source_cap, never_prune.
//      When never_prune is on, the two numerics render disabled.
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { useSources } from "@/hooks/useSources";
import type { Source } from "@/hooks/useSources";

interface Props {
  open: boolean;
  source: Source;
  onClose: () => void;
}

function parseRetention(src: Source) {
  const retention = (src.config?.retention ?? {}) as Record<string, unknown>;
  return {
    age_days: typeof retention.age_days === "number" ? String(retention.age_days) : "",
    per_source_cap:
      typeof retention.per_source_cap === "number" ? String(retention.per_source_cap) : "",
    never_prune: retention.never_prune === true,
  };
}

export function ConfigDialog({ open, source, onClose }: Props) {
  const { updateSource } = useSources();

  const [label, setLabel] = useState(source.name);
  const [enabled, setEnabled] = useState(source.enabled);
  const [ageDays, setAgeDays] = useState(parseRetention(source).age_days);
  const [perCap, setPerCap] = useState(parseRetention(source).per_source_cap);
  const [neverPrune, setNeverPrune] = useState(parseRetention(source).never_prune);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSave = async () => {
    setError(null);

    // Validate numerics
    if (!neverPrune) {
      if (ageDays !== "" && (isNaN(Number(ageDays)) || Number(ageDays) <= 0)) {
        setError("Age (days) must be positive.");
        return;
      }
      if (perCap !== "" && (isNaN(Number(perCap)) || Number(perCap) <= 0)) {
        setError("Per-source cap must be positive.");
        return;
      }
    }

    // Build patch body — only changed keys
    type PatchArgs = Parameters<typeof updateSource>[0];
    const patch: PatchArgs = { id: source.id };

    if (label !== source.name) {
      patch.label = label;
    }
    if (enabled !== source.enabled) {
      patch.enabled = enabled;
    }

    const origRetention = parseRetention(source);
    const retentionPatch: Record<string, unknown> = {};
    if (neverPrune !== origRetention.never_prune) {
      retentionPatch.never_prune = neverPrune;
    }
    if (!neverPrune) {
      if (ageDays !== origRetention.age_days && ageDays !== "") {
        retentionPatch.age_days = Number(ageDays);
      }
      if (perCap !== origRetention.per_source_cap && perCap !== "") {
        retentionPatch.per_source_cap = Number(perCap);
      }
    }
    if (Object.keys(retentionPatch).length > 0) {
      patch.config = { retention: retentionPatch as never };
    }

    setSaving(true);
    try {
      await updateSource(patch);
      onClose();
    } catch {
      setError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Configure source`} size="md">
      <div className="config-dialog">
        {/* ── Metadata ── */}
        <section>
          <span className="config-section-label">Metadata</span>

          <div className="config-field">
            <label htmlFor="config-label">Label</label>
            <input
              id="config-label"
              aria-label="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="config-field">
            <label htmlFor="config-url">URL</label>
            <input
              id="config-url"
              aria-label="URL"
              value={source.url}
              readOnly
              disabled
            />
            <span>Read-only — edit the source to change URL</span>
          </div>

          <div className="config-toggle">
            <input
              id="config-enabled"
              type="checkbox"
              aria-label="Enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <label htmlFor="config-enabled">Enabled</label>
          </div>
        </section>

        {/* ── Retention overrides ── */}
        <section>
          <span className="config-section-label">Retention overrides</span>

          <div className="config-field-row">
            <div className="config-field">
              <label htmlFor="config-age-days">Age (days)</label>
              <input
                id="config-age-days"
                aria-label="Age (days)"
                type="number"
                min={1}
                placeholder="30 (default)"
                value={ageDays}
                onChange={(e) => setAgeDays(e.target.value)}
                disabled={neverPrune}
              />
            </div>
            <div className="config-field">
              <label htmlFor="config-per-cap">Per-source cap</label>
              <input
                id="config-per-cap"
                aria-label="Per-source cap"
                type="number"
                min={1}
                placeholder="10 (default)"
                value={perCap}
                onChange={(e) => setPerCap(e.target.value)}
                disabled={neverPrune}
              />
            </div>
          </div>

          <div className="config-toggle">
            <input
              id="config-never-prune"
              type="checkbox"
              aria-label="Never prune"
              checked={neverPrune}
              onChange={(e) => setNeverPrune(e.target.checked)}
            />
            <label htmlFor="config-never-prune">Never prune</label>
          </div>
        </section>

        {error && <p className="config-error">{error}</p>}

        <div className="config-actions">
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => { void handleSave(); }} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
