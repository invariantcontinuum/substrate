/**
 * Postgres tab. Editing the database connection at runtime drains
 * active transactions and reconnects every service that holds a pool
 * — disruptive enough that the gateway's PUT and DELETE routes both
 * require an explicit ``X-Substrate-Confirm-Risk: postgres`` header.
 * The tab gates Save on a typed confirmation ("RECONNECT") AND
 * attaches the header to the mutation; either alone is insufficient.
 *
 * Reset clears every runtime override for the section so the
 * effective config falls back to ``services/graph/config.yaml`` (then
 * env, then Pydantic defaults) — same risk gate as Save.
 *
 * Test connection probes the live (unsaved) form values via
 * ``POST /api/postgres/test`` so the user can verify a credential
 * before committing the diff.
 */
import { useState } from "react";
import {
  useEffectiveConfig,
  useApplyConfig,
  useResetConfig,
} from "@/hooks/useRuntimeConfig";
import { apiFetch } from "@/lib/api";
import { useAuthToken } from "@/hooks/useAuthToken";
import { logger } from "@/lib/logger";

interface PostgresConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl_verify?: boolean;
  pool_min_size?: number;
  pool_max_size?: number;
  pool_recycle_seconds?: number;
  statement_timeout_ms?: number;
  lock_timeout_ms?: number;
}

interface ProbeResponse {
  ok: boolean;
  latency_ms: number;
  version: string;
  error?: string | null;
}

interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

const RISK_HEADER = { "X-Substrate-Confirm-Risk": "postgres" };

export function SettingsPostgresTab() {
  const { config, refetch } = useEffectiveConfig<PostgresConfig>("postgres");
  const apply = useApplyConfig("postgres");
  const reset = useResetConfig("postgres");
  const token = useAuthToken();

  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [confirmText, setConfirmText] = useState("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const merged = { ...config, ...draft } as PostgresConfig;
  const dirty = Object.keys(draft).length > 0;
  const canSave =
    dirty && confirmText === "RECONNECT" && !apply.isPending;

  function setField(k: keyof PostgresConfig, v: unknown) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }

  function onSave() {
    if (!canSave) return;
    apply.mutate(
      { payload: draft, headers: RISK_HEADER },
      {
        onSuccess: () => {
          setConfirmText("");
          setDraft({});
        },
      },
    );
  }

  function onReset() {
    if (reset.isPending) return;
    // Plain confirm() is intentional — modal/toast confirmation lives
    // in the modal shell elsewhere; for this destructive action the
    // explicit OS-level confirm doubles as a "are you sure" speed
    // bump on top of the X-Substrate-Confirm-Risk header.
    if (
      !window.confirm(
        "Reset all Postgres connection overrides? This drains active "
        + "transactions and reconnects every service.",
      )
    ) {
      return;
    }
    reset.mutate(
      { headers: RISK_HEADER },
      {
        onSuccess: () => {
          setDraft({});
          setConfirmText("");
          refetch();
        },
      },
    );
  }

  async function onTest() {
    if (!token || probing) return;
    setProbing(true);
    setProbe(null);
    const body = {
      host: merged.host ?? "",
      port: Number(merged.port ?? 5432),
      database: merged.database ?? "",
      user: merged.user ?? "",
      password: merged.password ?? "",
      ssl_verify: merged.ssl_verify ?? true,
    };
    try {
      const r = await apiFetch<ProbeResponse>(
        "/api/postgres/test",
        token,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setProbe({
        ok: r.ok,
        latencyMs: r.latency_ms,
        message: r.ok ? `OK · ${r.version || "connected"}` : (r.error ?? "probe failed"),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("postgres_test_failed", { error: msg });
      setProbe({ ok: false, latencyMs: 0, message: msg });
    } finally {
      setProbing(false);
    }
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
        label="Host"
        value={merged.host ?? ""}
        onChange={(v) => setField("host", v)}
        placeholder="postgres"
      />
      <Field
        label="Port"
        type="number"
        value={merged.port ?? 5432}
        onChange={(v) => setField("port", Number(v))}
      />
      <Field
        label="Database"
        value={merged.database ?? ""}
        onChange={(v) => setField("database", v)}
        placeholder="substrate_graph"
      />
      <Field
        label="User"
        value={merged.user ?? ""}
        onChange={(v) => setField("user", v)}
        placeholder="substrate_graph"
      />
      <Field
        label="Password"
        type="password"
        value={merged.password ?? ""}
        onChange={(v) => setField("password", v)}
        autoComplete="off"
      />
      <label className="num-knob">
        <span>SSL verify</span>
        <span>
          <input
            type="checkbox"
            checked={merged.ssl_verify ?? true}
            onChange={(e) => setField("ssl_verify", e.target.checked)}
          />{" "}
          {(merged.ssl_verify ?? true) ? "on" : "off"}
        </span>
      </label>

      <Field
        label="Pool min size"
        type="number"
        value={merged.pool_min_size ?? 2}
        onChange={(v) => setField("pool_min_size", Number(v))}
      />
      <Field
        label="Pool max size"
        type="number"
        value={merged.pool_max_size ?? 25}
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
      <Field
        label="Lock timeout (ms)"
        type="number"
        value={merged.lock_timeout_ms ?? 5000}
        onChange={(v) => setField("lock_timeout_ms", Number(v))}
      />

      <label className="num-knob">
        <span>Type RECONNECT to apply</span>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </label>

      {probe && (
        <div
          className={`postgres-probe ${probe.ok ? "is-ok" : "is-fail"}`}
          role="status"
        >
          <span className="postgres-probe__dot" aria-hidden="true" />
          <span>
            {probe.ok ? "Connected" : "Failed"} · {probe.latencyMs}ms
            {probe.message ? ` · ${probe.message}` : ""}
          </span>
        </div>
      )}

      <div className="actions">
        <button
          type="button"
          className="btn-primary"
          onClick={onSave}
          disabled={!canSave}
        >
          {apply.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onReset}
          disabled={reset.isPending}
        >
          {reset.isPending ? "Resetting…" : "Reset"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onTest}
          disabled={probing || !merged.host}
        >
          {probing ? "Testing…" : "Test connection"}
        </button>
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number" | "password";
  placeholder?: string;
  autoComplete?: string;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: FieldProps) {
  return (
    <label className="conn-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </label>
  );
}
