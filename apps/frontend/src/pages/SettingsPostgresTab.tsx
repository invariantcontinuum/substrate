/**
 * Postgres tab. Editing the DSN at runtime drains active transactions
 * and reconnects every service that holds a pool — disruptive enough
 * that the gateway's PUT route requires the explicit
 * ``X-Substrate-Confirm-Risk: postgres`` header. The tab gates the
 * Apply button on a typed confirmation ("RECONNECT") AND attaches the
 * header to the mutation; either alone is insufficient.
 */
import { useState } from "react";
import { useEffectiveConfig, useApplyConfig } from "@/hooks/useRuntimeConfig";

interface PostgresConfig {
  database_url?: string;
  pool_min_size?: number;
  pool_max_size?: number;
  pool_recycle_seconds?: number;
  statement_timeout_ms?: number;
  lock_timeout_ms?: number;
}

interface FieldProps {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "password";
  readonly?: boolean;
}

export function SettingsPostgresTab() {
  const { config } = useEffectiveConfig<PostgresConfig>("postgres");
  const apply = useApplyConfig("postgres");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [confirmText, setConfirmText] = useState("");

  const merged = { ...config, ...draft } as PostgresConfig;
  const dirty = Object.keys(draft).length > 0;
  const canApply = dirty && confirmText === "RECONNECT" && !apply.isPending;

  function setField(k: string, v: unknown) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }

  function save() {
    if (!canApply) return;
    apply.mutate(
      {
        payload: draft,
        headers: { "X-Substrate-Confirm-Risk": "postgres" },
      },
      {
        onSuccess: () => {
          setConfirmText("");
          setDraft({});
        },
      },
    );
  }

  return (
    <section className="settings-postgres">
      <h3>Postgres</h3>
      <div
        className="warning-banner"
        role="alert"
        style={{
          padding: "0.75rem 1rem",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.4)",
          borderRadius: 6,
          marginBlock: "0.5rem 1rem",
        }}
      >
        Editing the database connection at runtime drains active transactions
        and reconnects all services. Inflight operations may fail. Required for
        recovery scenarios only.
      </div>

      <Field
        label="DSN"
        type="password"
        value={merged.database_url ?? ""}
        onChange={(v) => setField("database_url", v)}
      />
      <Field
        label="Pool min size"
        type="number"
        value={merged.pool_min_size ?? 1}
        onChange={(v) => setField("pool_min_size", Number(v))}
      />
      <Field
        label="Pool max size"
        type="number"
        value={merged.pool_max_size ?? 10}
        onChange={(v) => setField("pool_max_size", Number(v))}
      />
      <Field
        label="Recycle (s)"
        type="number"
        value={merged.pool_recycle_seconds ?? 1800}
        onChange={(v) => setField("pool_recycle_seconds", Number(v))}
      />
      <Field
        label="Statement timeout (ms)"
        type="number"
        value={merged.statement_timeout_ms ?? 60000}
        onChange={(v) => setField("statement_timeout_ms", Number(v))}
      />

      <label className="num-knob">
        <span>Type RECONNECT to apply</span>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </label>

      <div className="actions">
        <button onClick={save} disabled={!canApply}>
          Apply
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  readonly,
}: FieldProps) {
  return (
    <label className="conn-field">
      <span>{label}</span>
      <input
        type={type}
        readOnly={readonly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
