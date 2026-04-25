import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useSources, type Source } from "@/hooks/useSources";

function SourceSettingsCard({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);
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
          <p className="muted">
            Schedule, retention, drift threshold, and integration credentials
            for <code>{source.owner}/{source.name}</code>.
            <br />
            Inline editing of these fields is wired in sub-project 6.
          </p>
        </div>
      )}
    </li>
  );
}

export function PerSourceSettingsList() {
  const { sources } = useSources();
  if (!sources || sources.length === 0) {
    return <p className="muted">No sources to configure yet.</p>;
  }
  return (
    <section className="per-source-settings-list">
      <h3>Per-source settings</h3>
      <ul>
        {sources.map((s) => (
          <SourceSettingsCard key={s.id} source={s} />
        ))}
      </ul>
    </section>
  );
}
